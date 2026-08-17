"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import type { HouseholdGoal, HouseholdGoalStatus, HouseholdVaultTransactionSource } from "@/lib/supabase/types";

export interface HouseholdGoalSummary {
  goal: HouseholdGoal;
  /** Always derived live by summing household_vault_transactions — never trusted from a cached column, mirroring getVaultSummary's approach for the personal vault. */
  currentAmount: number;
  progressPct: number;
  /** The goal creator's display name — dynamic from their profile (see displayName()), never a hardcoded label, and shown to every household member regardless of who's logged in. */
  creatorName: string;
}

export interface GoalContributor {
  userId: string;
  name: string;
  avatarUrl: string | null;
  amount: number;
  /** Share of this goal's total, not of anyone's private balance — never derived from or exposing a member's personal vault. */
  percentage: number;
  contributionCount: number;
  lastContribution: { amount: number; createdAt: string } | null;
}

export interface HouseholdGoalDetail extends HouseholdGoalSummary {
  contributors: GoalContributor[];
}

function computeProgress(currentAmount: number, targetAmount: number): number {
  if (targetAmount <= 0) return 0;
  return Math.min(100, Math.round((currentAmount / targetAmount) * 100));
}

/** Active goals (or a specific status) for a household, each with a live-derived balance and progress. */
export async function listGoals(householdId: string, opts?: { status?: HouseholdGoalStatus }): Promise<HouseholdGoalSummary[]> {
  const supabase = await createClient();
  let query = supabase.from("household_goals").select("*").eq("household_id", householdId).order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status);
  const { data: goals } = await query;
  if (!goals || goals.length === 0) return [];

  const vaultIds = goals.map((g) => g.vault_id);
  const { data: txns } = await supabase.from("household_vault_transactions").select("vault_id, type, amount").in("vault_id", vaultIds);

  const totalsByVault = new Map<string, number>();
  for (const t of txns ?? []) {
    const delta = t.type === "add" ? t.amount : -t.amount;
    totalsByVault.set(t.vault_id, (totalsByVault.get(t.vault_id) ?? 0) + delta);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", Array.from(new Set(goals.map((g) => g.created_by))));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return goals.map((goal) => {
    const currentAmount = totalsByVault.get(goal.vault_id) ?? 0;
    return {
      goal,
      currentAmount,
      progressPct: computeProgress(currentAmount, goal.target_amount),
      creatorName: displayName(profileById.get(goal.created_by)),
    };
  });
}

export async function createGoal(
  householdId: string,
  input: { name: string; icon?: string | null; targetAmount: number; deadline?: string | null; notes?: string | null }
): Promise<{ goalId: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_household_goal", {
    p_household_id: householdId,
    p_name: input.name.trim(),
    p_icon: input.icon ?? null,
    p_target_amount: input.targetAmount,
    p_deadline: input.deadline ?? null,
    p_notes: input.notes ?? null,
  });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to create goal" };

  revalidatePath("/household");
  return { goalId: data.goal_id };
}

/**
 * Deletes a goal along with its dedicated vault and contribution history —
 * only the household owner or the goal's original creator may do this. The
 * real gate is delete_household_goal()/RLS server-side (see supabase/schema.sql);
 * the UI only ever hides the control for everyone else.
 */
export async function deleteGoal(goalId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_household_goal", { p_goal_id: goalId });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to delete goal" };

  revalidatePath("/household");
  revalidatePath("/vault");
  return { ok: true };
}

/** Goal detail with a per-contributor breakdown (amount + percentage of this goal only) — never exposes anyone's private vault balance, only what they've explicitly contributed here. */
export async function getGoalDetail(goalId: string): Promise<HouseholdGoalDetail | null> {
  const supabase = await createClient();
  const { data: goal } = await supabase.from("household_goals").select("*").eq("id", goalId).single();
  if (!goal) return null;

  const { data: txns } = await supabase
    .from("household_vault_transactions")
    .select("*")
    .eq("vault_id", goal.vault_id)
    .order("created_at", { ascending: false });
  const rows = txns ?? [];

  const currentAmount = rows.reduce((sum, t) => sum + (t.type === "add" ? t.amount : -t.amount), 0);

  const byUser = new Map<string, { amount: number; count: number; last: { amount: number; createdAt: string } | null }>();
  for (const t of rows) {
    if (t.type !== "add") continue;
    const existing = byUser.get(t.user_id) ?? { amount: 0, count: 0, last: null };
    existing.amount += t.amount;
    existing.count += 1;
    if (!existing.last || t.created_at > existing.last.createdAt) existing.last = { amount: t.amount, createdAt: t.created_at };
    byUser.set(t.user_id, existing);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", Array.from(new Set([...byUser.keys(), goal.created_by])));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const contributors: GoalContributor[] = Array.from(byUser.entries())
    .map(([userId, v]) => ({
      userId,
      name: displayName(profileById.get(userId)),
      avatarUrl: profileById.get(userId)?.avatar_url ?? null,
      amount: v.amount,
      percentage: currentAmount > 0 ? Math.round((v.amount / currentAmount) * 100) : 0,
      contributionCount: v.count,
      lastContribution: v.last,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    goal,
    currentAmount,
    progressPct: computeProgress(currentAmount, goal.target_amount),
    creatorName: displayName(profileById.get(goal.created_by)),
    contributors,
  };
}

/**
 * Contributes to a goal — funded either from the caller's personal vault
 * (atomically deducted there, see contribute_to_household_vault() in
 * supabase/schema.sql) or logged as an external/manual amount. Never updates
 * only the UI: both ledgers (or just the household one, for external) are
 * written server-side before this returns.
 */
export async function contributeToGoal(
  goalId: string,
  amount: number,
  source: HouseholdVaultTransactionSource,
  comment?: string | null
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: goal } = await supabase
    .from("household_goals")
    .select("id, household_id, vault_id, name, target_amount, status")
    .eq("id", goalId)
    .single();
  if (!goal) return { error: "Goal not found" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("contribute_to_household_vault", {
    p_vault_id: goal.vault_id,
    p_amount: amount,
    p_source: source,
    p_comment: comment ?? null,
  });
  if (error || !data?.ok) return { error: error?.message ?? "Contribution failed" };

  if (goal.status === "active") {
    const { data: txns } = await supabase.from("household_vault_transactions").select("type, amount").eq("vault_id", goal.vault_id);
    const total = (txns ?? []).reduce((sum, t) => sum + (t.type === "add" ? t.amount : -t.amount), 0);
    if (total >= goal.target_amount) {
      await supabase.from("household_goals").update({ status: "completed" }).eq("id", goalId);
      await supabase.from("household_activity").insert({
        household_id: goal.household_id,
        actor_user_id: user.id,
        kind: "goal_completed",
        payload: { goal_id: goalId, name: goal.name },
        goal_id: goalId,
      });
    }
  }

  revalidatePath("/household");
  revalidatePath("/vault");
  return { ok: true };
}
