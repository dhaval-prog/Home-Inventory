"use server";

import { createClient } from "@/lib/supabase/server";
import { getHouseholdContext } from "@/lib/actions/household";
import { listGoals, type HouseholdGoalSummary } from "@/lib/actions/household-goals";

export interface HouseholdMemberContribution {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Sum of what this member has explicitly contributed to shared vaults/goals — never their private personal-vault balance. */
  totalContributed: number;
}

export interface HouseholdActivityEntry {
  id: string;
  kind: string;
  actorName: string;
  message: string;
  createdAt: string;
}

export interface HouseholdSummary {
  totalSharedSavings: number;
  goals: HouseholdGoalSummary[];
  memberContributions: HouseholdMemberContribution[];
  activity: HouseholdActivityEntry[];
}

/** Turns a raw activity row into a friendly sentence — the household_activity payload is intentionally small (ids/amounts/names), never a member's private financial data. */
function describeActivity(kind: string, actorName: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case "contribution": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      const vaultName = typeof payload.vault_name === "string" ? payload.vault_name : "the household vault";
      return `${actorName} contributed ₹${Math.round(amount).toLocaleString("en-IN")} to ${vaultName}`;
    }
    case "goal_created": {
      const name = typeof payload.name === "string" ? payload.name : "a goal";
      return `${actorName} created the "${name}" goal`;
    }
    case "goal_completed": {
      const name = typeof payload.name === "string" ? payload.name : "a goal";
      return `🎉 "${name}" reached its savings target!`;
    }
    case "goal_deleted": {
      const name = typeof payload.name === "string" ? payload.name : "a goal";
      return `${actorName} deleted the "${name}" goal`;
    }
    case "member_joined":
      return `${actorName} joined the household`;
    default:
      return `${actorName} updated the household`;
  }
}

/**
 * The household dashboard's single data source: total pooled savings (shared
 * vault + every goal vault, all derived live), active goals with progress,
 * per-member contribution totals (never private balances), and a friendly
 * activity feed. Returns null if the caller isn't a member of this household.
 */
export async function getHouseholdSummary(householdId: string): Promise<HouseholdSummary | null> {
  const supabase = await createClient();
  const context = await getHouseholdContext(householdId);
  if (!context) return null;

  const [{ data: vaults }, goals] = await Promise.all([
    supabase.from("household_vaults").select("id").eq("household_id", householdId),
    listGoals(householdId),
  ]);

  const vaultIds = (vaults ?? []).map((v) => v.id);
  const { data: allTxns } = vaultIds.length
    ? await supabase.from("household_vault_transactions").select("user_id, type, amount").in("vault_id", vaultIds)
    : { data: [] };

  const totalSharedSavings = (allTxns ?? []).reduce((sum, t) => sum + (t.type === "add" ? t.amount : -t.amount), 0);

  const byMember = new Map<string, number>();
  for (const t of allTxns ?? []) {
    if (t.type !== "add") continue;
    byMember.set(t.user_id, (byMember.get(t.user_id) ?? 0) + t.amount);
  }

  const memberContributions: HouseholdMemberContribution[] = context.members
    .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, totalContributed: byMember.get(m.userId) ?? 0 }))
    .sort((a, b) => b.totalContributed - a.totalContributed);

  const { data: activityRows } = await supabase
    .from("household_activity")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(20);

  const nameByActor = new Map(context.members.map((m) => [m.userId, m.name]));
  const activity: HouseholdActivityEntry[] = (activityRows ?? []).map((a) => {
    const actorName = nameByActor.get(a.actor_user_id) ?? "Someone";
    return { id: a.id, kind: a.kind, actorName, message: describeActivity(a.kind, actorName, a.payload), createdAt: a.created_at };
  });

  return { totalSharedSavings, goals, memberContributions, activity };
}
