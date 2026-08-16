"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTranscript } from "@/lib/voice/nlu";
import { parseMoneyExpression } from "@/lib/vault/money-parser";
import { listGoals } from "@/lib/actions/household-goals";
import { processHouseholdVoiceCommand } from "@/lib/actions/household-voice";
import type { VaultVoiceResult } from "@/lib/actions/vault-voice";
import type { HouseholdChatMessage, HouseholdChatMessageKind } from "@/lib/supabase/types";

/**
 * Home Chat — context-aware, not a generic message log. A message that
 * clearly asks a vault question or commits to a contribution is routed
 * through the SAME NLU pipeline as voice/text (src/lib/voice/nlu.ts +
 * household-voice.ts), never a parallel intent system, and answered inline
 * with a 'system' reply. A message that only *suggests* a goal (an amount
 * plus a savings phrase, possibly split across the last two messages, e.g.
 * "we should start saving for a fridge" followed by "about ₹45,000") gets a
 * lightweight rendering hint so the UI can offer a one-click "Create Goal"
 * button — nothing is ever auto-created from an ambiguous suggestion.
 */

export interface HouseholdChatMessageWithSender extends HouseholdChatMessage {
  senderName: string;
}

const GOAL_KEYWORD_RE = /\b(save|saving|savings|goal|fund)\b/i;
const GOAL_PURPOSE_RE = /\b(?:for|toward)\s+(?:a\s+|an\s+|our\s+|the\s+|new\s+)*(.+?)[.!?]*$/i;

function looksLikeGoalSuggestion(text: string): boolean {
  return GOAL_KEYWORD_RE.test(text) && /\bfor\b|\btoward\b/i.test(text);
}

function extractGoalName(text: string): string | null {
  const m = text.match(GOAL_PURPOSE_RE);
  if (!m) return null;
  const name = m[1].trim();
  if (!name || name.split(/\s+/).length > 6) return null;
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Combines the current message with the previous one so a two-message exchange ("let's save for a fridge" / "about 45000") still produces one suggestion. */
function detectGoalSuggestion(
  currentText: string,
  previousUserText: string | null
): { name: string; targetAmount: number } | null {
  const currentIsGoalPhrase = looksLikeGoalSuggestion(currentText);
  if (!currentIsGoalPhrase && !(previousUserText && looksLikeGoalSuggestion(previousUserText))) return null;

  const amount = parseMoneyExpression(currentText) ?? (previousUserText ? parseMoneyExpression(previousUserText) : null);
  const name = extractGoalName(currentText) ?? (previousUserText ? extractGoalName(previousUserText) : null);

  if (amount == null || !name) return null;
  return { name, targetAmount: amount };
}

function describeResultForChat(result: VaultVoiceResult): string {
  return "message" in result ? result.message : "Done.";
}

export async function sendHouseholdMessage(householdId: string, text: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "Message can't be empty" };

  const [{ data: recentRows }, goals] = await Promise.all([
    supabase
      .from("household_chat_messages")
      .select("message, kind")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(5),
    listGoals(householdId, { status: "active" }),
  ]);
  const previousUserMessage = (recentRows ?? []).find((r) => r.kind === "user")?.message ?? null;

  const nlu = await parseTranscript(trimmed, { householdGoalNames: goals.map((g) => g.goal.name) });

  let actionResult: VaultVoiceResult | null = null;
  if (nlu.intent === "vault") {
    const action = nlu.actions[0];
    if (action?.intent === "contribute_household_goal" || action?.intent === "check_household_balance") {
      actionResult = await processHouseholdVoiceCommand(householdId, action);
    }
  }

  let metadata: Record<string, unknown> = {};
  if (!actionResult) {
    const suggestion = detectGoalSuggestion(trimmed, previousUserMessage);
    if (suggestion) metadata = { type: "suggest_goal", name: suggestion.name, target_amount: suggestion.targetAmount };
  }

  const { error: insertError } = await supabase
    .from("household_chat_messages")
    .insert({ household_id: householdId, user_id: user.id, message: trimmed, kind: "user", metadata });
  if (insertError) return { error: insertError.message };

  if (actionResult) {
    await supabase.from("household_chat_messages").insert({
      household_id: householdId,
      user_id: user.id,
      message: describeResultForChat(actionResult),
      kind: "system",
      metadata: { type: "action_result", result_kind: actionResult.kind },
    });
  }

  revalidatePath("/household");
  return { ok: true };
}

export async function listHouseholdMessages(householdId: string, limit = 50): Promise<HouseholdChatMessageWithSender[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("household_chat_messages")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!rows || rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name || "Member"]));

  return rows.map((r) => ({
    ...r,
    senderName: r.kind === ("system" satisfies HouseholdChatMessageKind) ? "Vault Assistant" : (nameById.get(r.user_id) ?? "Member"),
  }));
}
