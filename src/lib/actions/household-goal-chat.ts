"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import type { HouseholdGoalChatMessage, HouseholdGoalChatMessageKind } from "@/lib/supabase/types";

/**
 * Goal Chat — scoped to one goal (is_goal_member(goal_id) RLS, see
 * supabase/schema.sql), completely independent of Split Chat
 * (is_split_group_member) and Home Chat (has_home_access). A member of this
 * goal who isn't in the relevant split group (or vice versa) never sees the
 * other chat — see the CORE RULE. Same lightweight, sender-owned-edit/delete
 * design as Split Chat (household-actions/split-chat.ts): no read-receipt
 * tracking or seen-locked editing.
 */

export interface GoalChatMessageWithSender extends HouseholdGoalChatMessage {
  senderName: string;
  editable: boolean;
}

export async function sendGoalMessage(goalId: string, text: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "Message can't be empty" };

  const { data: goal } = await supabase.from("household_goals").select("household_id").eq("id", goalId).maybeSingle();
  if (!goal) return { error: "Goal not found" };

  const { error } = await supabase
    .from("household_goal_chat_messages")
    .insert({ goal_id: goalId, household_id: goal.household_id, user_id: user.id, message: trimmed, kind: "user" });
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { ok: true };
}

export async function listGoalMessages(goalId: string, limit = 50): Promise<GoalChatMessageWithSender[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from("household_goal_chat_messages")
    .select("*")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!rows || rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in(
      "id",
      Array.from(new Set(rows.map((r) => r.user_id)))
    );
  const nameById = new Map((profiles ?? []).map((p) => [p.id, displayName(p)]));

  return rows.map((r) => ({
    ...r,
    senderName: r.kind === ("system" satisfies HouseholdGoalChatMessageKind) ? "Goal Assistant" : (nameById.get(r.user_id) ?? "Member"),
    editable: r.kind === "user" && r.user_id === user?.id,
  }));
}

export async function editGoalMessage(messageId: string, newText: string): Promise<{ ok: true } | { error: string }> {
  const trimmed = newText.trim();
  if (!trimmed) return { error: "Message can't be empty" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_goal_chat_messages")
    .update({ message: trimmed, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This message can no longer be edited." };

  revalidatePath("/household");
  return { ok: true };
}

export async function deleteGoalMessage(messageId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("household_goal_chat_messages").delete().eq("id", messageId).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This message can no longer be deleted." };

  revalidatePath("/household");
  return { ok: true };
}
