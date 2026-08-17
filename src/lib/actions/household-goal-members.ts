"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import { getHouseholdContext } from "@/lib/actions/household";

/**
 * New Goal's own membership — deliberately separate from Let's Split
 * (src/lib/actions/split.ts's split-group member functions) and from plain
 * household membership. See household_goal_members/is_goal_member in
 * supabase/schema.sql: being a household member does NOT by itself grant
 * visibility into a goal.
 */

export interface GoalMemberInfo {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isCreator: boolean;
}

/** This goal's own member list — sourced from household_goal_members + profiles, never from the household roster. */
export async function listGoalMembers(goalId: string): Promise<GoalMemberInfo[]> {
  const supabase = await createClient();
  const [{ data: goal }, { data: members }] = await Promise.all([
    supabase.from("household_goals").select("created_by").eq("id", goalId).maybeSingle(),
    supabase.from("household_goal_members").select("user_id").eq("goal_id", goalId),
  ]);
  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return userIds.map((id) => ({
    userId: id,
    name: displayName(profileById.get(id)),
    avatarUrl: profileById.get(id)?.avatar_url ?? null,
    isCreator: id === goal?.created_by,
  }));
}

/**
 * Household members not yet on this goal — the candidate list for "Invite
 * Members" inside New Goal. Only meaningful for someone who can already see
 * the full household roster (the goal's manager, who by definition has
 * HOME_ACCESS); a non-manager gets an empty list, never a roster leak.
 */
export async function listEligibleGoalMembers(goalId: string, householdId: string): Promise<GoalMemberInfo[]> {
  const context = await getHouseholdContext(householdId);
  if (!context) return [];

  const supabase = await createClient();
  const { data: members } = await supabase.from("household_goal_members").select("user_id").eq("goal_id", goalId);
  const existingIds = new Set((members ?? []).map((m) => m.user_id));

  return context.members
    .filter((m) => !existingIds.has(m.userId))
    .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, isCreator: false }));
}

export async function addGoalMember(goalId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_goal_member", { p_goal_id: goalId, p_user_id: userId });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to add member" };

  revalidatePath("/household");
  return { ok: true };
}

export async function removeGoalMember(goalId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_goal_member", { p_goal_id: goalId, p_user_id: userId });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to remove member" };

  revalidatePath("/household");
  return { ok: true };
}
