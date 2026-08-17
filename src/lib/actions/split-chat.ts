"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import { parseMoneyExpression } from "@/lib/vault/money-parser";
import type {
  SplitChatMessage,
  SplitChatMessageKind,
} from "@/lib/supabase/types";

/**
 * Split Chat — scoped to one split group (SPLIT_CHAT_ACCESS, enforced by
 * is_split_group_member(group_id) RLS — see supabase/schema.sql), completely
 * separate from Home Chat (household-chat.ts, HOME_CHAT_ACCESS). Deliberately
 * simpler than Home Chat: no read-receipt tracking or seen-locked editing —
 * a sender can edit/delete their own message any time.
 *
 * A message that mentions paying for something with an amount (e.g. "I paid
 * the electricity bill" / "₹4,500, split it between all four of us") gets a
 * lightweight rendering hint so the UI can offer a one-click "Review & Add"
 * button that opens the (still-editable, still-confirm-required) Add Expense
 * form pre-filled — nothing is ever created from chat without that explicit
 * confirmation. Rule-based, same style as Home Chat's goal-suggestion
 * detection (household-chat.ts) — not a new AI dependency.
 */

export interface SplitChatMessageWithSender extends SplitChatMessage {
  senderName: string;
  /** True only for the sender's own 'user' messages. */
  editable: boolean;
}

const EXPENSE_MENTION_RE = /\b(paid|spent|bought)\b/i;

function extractExpenseDescription(text: string): string | null {
  const m = text.match(
    /\b(?:paid|spent|bought)\b\s*(?:for\s+)?(?:the\s+|our\s+|my\s+|a\s+|an\s+)?(.+?)(?:\s+bill)?[.!?]*$/i,
  );
  if (!m) return null;
  const raw = m[1]
    .replace(/[₹$]?\s*[\d,]+(\.\d+)?\s*(k|thousand|lakh|lac|crore)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!raw || raw.split(/\s+/).length > 6) return null;
  return raw
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Combines the current message with the previous one so a two-message exchange ("I paid the electricity bill" / "₹4,500, split between all four of us") still produces one suggestion. */
function detectExpenseSuggestion(
  currentText: string,
  previousUserText: string | null,
): { description: string; amount: number } | null {
  const currentMentionsExpense = EXPENSE_MENTION_RE.test(currentText);
  if (
    !currentMentionsExpense &&
    !(previousUserText && EXPENSE_MENTION_RE.test(previousUserText))
  )
    return null;

  const amount =
    parseMoneyExpression(currentText) ??
    (previousUserText ? parseMoneyExpression(previousUserText) : null);
  const description =
    extractExpenseDescription(currentText) ??
    (previousUserText ? extractExpenseDescription(previousUserText) : null);

  if (amount == null || !description) return null;
  return { description, amount };
}

export async function sendSplitMessage(
  groupId: string,
  text: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = text.trim();
  if (!trimmed) return { error: "Message can't be empty" };

  const { data: group } = await supabase
    .from("split_groups")
    .select("household_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { error: "Split group not found" };

  const { data: recentRows } = await supabase
    .from("split_chat_messages")
    .select("message, kind")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(5);
  const previousUserMessage =
    (recentRows ?? []).find((r) => r.kind === "user")?.message ?? null;

  const suggestion = detectExpenseSuggestion(trimmed, previousUserMessage);
  const metadata: Record<string, unknown> = suggestion
    ? {
        type: "suggest_expense",
        description: suggestion.description,
        amount: suggestion.amount,
      }
    : {};

  const { error } = await supabase
    .from("split_chat_messages")
    .insert({
      group_id: groupId,
      household_id: group.household_id,
      user_id: user.id,
      message: trimmed,
      kind: "user",
      metadata,
    });
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { ok: true };
}

export async function listSplitMessages(
  groupId: string,
  limit = 50,
): Promise<SplitChatMessageWithSender[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from("split_chat_messages")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!rows || rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", Array.from(new Set(rows.map((r) => r.user_id))));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, displayName(p)]));

  return rows.map((r) => ({
    ...r,
    senderName:
      r.kind === ("system" satisfies SplitChatMessageKind)
        ? "Split Assistant"
        : (nameById.get(r.user_id) ?? "Member"),
    editable: r.kind === "user" && r.user_id === user?.id,
  }));
}

export async function editSplitMessage(
  messageId: string,
  newText: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = newText.trim();
  if (!trimmed) return { error: "Message can't be empty" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("split_chat_messages")
    .update({ message: trimmed, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This message can no longer be edited." };

  revalidatePath("/household");
  return { ok: true };
}

export async function deleteSplitMessage(
  messageId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("split_chat_messages")
    .delete()
    .eq("id", messageId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This message can no longer be deleted." };

  revalidatePath("/household");
  return { ok: true };
}
