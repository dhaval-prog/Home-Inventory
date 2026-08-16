"use server";

import { createClient } from "@/lib/supabase/server";
import { parseTranscript } from "@/lib/voice/nlu";
import type { VaultNluContext } from "@/lib/voice/nlu-gemini";
import { fuzzyMatchByName } from "@/lib/voice/synonyms";
import { matchCategory } from "@/lib/vault/categories";
import { parseMoneyExpression } from "@/lib/vault/money-parser";
import { parseDateRange, type DateRange } from "@/lib/vault/date-range";
import {
  computeSpendingInsights,
  deleteVaultTransaction,
  findVaultTransactions,
  getMostRecentTransaction,
  getTransactionById,
  getVaultSummary,
  isUnusuallyLargeAmount,
  linkTransactionToInventoryItem,
  recordVaultTransaction,
  updateVaultTransaction,
} from "@/lib/vault/ledger";
import { upsertRecurringPlan } from "@/lib/vault/recurring";
import type { NluResult, VaultAction, VaultIntent, VaultTxnKind } from "@/lib/voice/types";
import type { Database, VaultTransaction, VaultTransactionType } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Session-local conversational memory, held by the client (VoiceSearchPanel)
 * and passed back in on every call — never persisted server-side. This is
 * what lets "actually make that 4000" or a bare "groceries" reply resolve
 * correctly without the user repeating themselves.
 */
export interface VaultSessionTransactionSummary {
  id: string;
  type: VaultTransactionType;
  amount: number;
  category: string | null;
  comment: string | null;
}

export type VaultPendingKind = "clarify-amount" | "clarify-category" | "confirm-large" | "disambiguate";

export interface VaultPendingState {
  kind: VaultPendingKind;
  action: VaultAction;
  options?: { id: string; label: string }[];
}

export interface VaultSessionContext {
  lastTransaction: VaultSessionTransactionSummary | null;
  pending: VaultPendingState | null;
  /**
   * Plain-English description of whatever the previous turn showed —
   * inventory or vault alike, e.g. "Showed grocery spending: ₹3,200 this
   * month." — generalizes lastTransaction to read-only results so a bare
   * follow-up like "what about last month?" resolves against it. Set by the
   * client from the previous VoiceProcessResult; never persisted server-side.
   */
  previousTurnSummary?: string | null;
}

export interface VaultVoiceExecuted {
  kind: "vault-executed";
  intent: VaultIntent;
  message: string;
  amount?: number | null;
  category?: string | null;
  comment?: string | null;
  balance?: number;
  transactionId?: string;
}

export interface VaultVoiceAnswer {
  kind: "vault-answer";
  intent: VaultIntent;
  message: string;
  amount?: number;
  detail?: string;
}

export interface VaultVoiceHistoryRow {
  id: string;
  type: VaultTransactionType;
  amount: number;
  category: string | null;
  comment: string | null;
  createdAt: string;
}

export interface VaultVoiceHistory {
  kind: "vault-history";
  message: string;
  transactions: VaultVoiceHistoryRow[];
}

export interface VaultVoiceClarify {
  kind: "vault-clarify";
  question: string;
  pendingAction: VaultAction;
  /** Echoed back by the client as sessionContext.pending.kind on the next call, so the server knows how to interpret the reply. */
  pendingKind: "clarify-amount" | "clarify-category";
}

export interface VaultVoiceConfirm {
  kind: "vault-confirm";
  message: string;
  pendingAction: VaultAction;
  pendingKind: "confirm-large";
}

export interface VaultVoiceDisambiguate {
  kind: "vault-disambiguate";
  message: string;
  options: { id: string; label: string }[];
  pendingAction: VaultAction;
  pendingKind: "disambiguate";
}

export interface VaultVoiceError {
  kind: "vault-error";
  message: string;
}

export type VaultVoiceResult =
  | VaultVoiceExecuted
  | VaultVoiceAnswer
  | VaultVoiceHistory
  | VaultVoiceClarify
  | VaultVoiceConfirm
  | VaultVoiceDisambiguate
  | VaultVoiceError;

const AFFIRMATIVE_RE = /^(yes|yeah|yep|yup|sure|confirm|go ahead|do it|okay|ok|please do)\b/i;
const NEGATIVE_RE = /^(no|nope|nah|cancel|never\s*mind|don'?t)\b/i;

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function describeTxn(t: VaultTransaction): string {
  const sign = t.type === "deduct" ? "−" : "+";
  const tag = t.category ? ` · ${t.category}` : t.label ? ` · ${t.label}` : "";
  return `${sign}${inr(t.amount)}${tag}`;
}

function summarizeSessionTxn(t: VaultSessionTransactionSummary): string {
  const verb = t.type === "deduct" ? "deducted" : "added";
  const cat = t.category ? ` for ${t.category}` : "";
  return `The most recent voice transaction ${verb} ${inr(t.amount)}${cat}.`;
}

function buildGeminiContext(pending: VaultPendingState | null, session: VaultSessionContext | null): VaultNluContext | undefined {
  const lastTransactionSummary = session?.lastTransaction ? summarizeSessionTxn(session.lastTransaction) : null;
  const previousTurnSummary = session?.previousTurnSummary ?? null;
  if (!pending && !lastTransactionSummary && !previousTurnSummary) return undefined;
  return {
    pendingQuestion:
      pending?.kind === "clarify-amount" ? "How much was it?" : pending?.kind === "clarify-category" ? "What was it for?" : null,
    lastTransactionSummary,
    previousTurnSummary,
  };
}

/** Fills the pending slot directly from the raw reply when Gemini isn't configured (no multi-turn understanding in the rule-based fallback). */
function fillPendingSlotHeuristically(transcript: string, pending: VaultPendingState): VaultAction | null {
  const action = { ...pending.action };
  if (pending.kind === "clarify-amount") {
    const amount = parseMoneyExpression(transcript);
    if (amount == null) return null;
    // Which field "the amount" fills depends on which question was actually asked.
    if (action.intent === "set_recurring") {
      action.recurring = { amount, scheduleMode: action.recurring?.scheduleMode ?? null, dayOfMonth: action.recurring?.dayOfMonth ?? null, enabled: action.recurring?.enabled ?? true };
    } else if (action.intent === "edit_transaction") {
      action.newAmount = amount;
    } else {
      action.amount = amount;
    }
    return action;
  }
  // clarify-category
  const category = matchCategory(transcript.toLowerCase());
  if (category) {
    action.category = category;
  } else if (transcript.trim()) {
    action.comment = action.comment ?? transcript.trim();
  } else {
    return null;
  }
  return action;
}

function mergeWithPendingAction(action: VaultAction, pendingAction: VaultAction | null): VaultAction {
  if (!pendingAction) return action;
  return {
    intent: pendingAction.intent,
    amount: action.amount ?? pendingAction.amount,
    category: action.category ?? pendingAction.category,
    comment: action.comment ?? pendingAction.comment,
    datePhrase: action.datePhrase ?? pendingAction.datePhrase,
    reference: action.reference ?? pendingAction.reference,
    newAmount: action.newAmount ?? pendingAction.newAmount,
    newCategory: action.newCategory ?? pendingAction.newCategory,
    recurring: action.recurring ?? pendingAction.recurring,
    itemEntity: action.itemEntity ?? pendingAction.itemEntity,
    goalName: action.goalName ?? pendingAction.goalName,
    confidence: action.confidence,
  };
}

interface ReferenceResolution {
  transaction: VaultTransaction | null;
  candidates: VaultTransaction[];
}

async function resolveReferencedTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  reference: VaultAction["reference"],
  session: VaultSessionContext | null
): Promise<ReferenceResolution> {
  if (!reference || (!reference.ordinal && !reference.kind && !reference.category && !reference.datePhrase)) {
    let t: VaultTransaction | null = null;
    if (session?.lastTransaction) t = await getTransactionById(supabase, userId, session.lastTransaction.id);
    if (!t) t = await getMostRecentTransaction(supabase, userId, {});
    return { transaction: t, candidates: t ? [t] : [] };
  }

  const range = reference.datePhrase ? (parseDateRange(reference.datePhrase) ?? undefined) : undefined;
  const type: VaultTransactionType | undefined = reference.kind === "recurring" ? "recurring" : (reference.kind as VaultTxnKind | undefined);
  const candidates = await findVaultTransactions(supabase, userId, {
    type,
    category: reference.category ?? undefined,
    range,
    limit: 5,
  });

  if (candidates.length === 0) return { transaction: null, candidates: [] };
  if (candidates.length === 1 || reference.ordinal === "last") return { transaction: candidates[0], candidates };
  return { transaction: null, candidates };
}

async function executeAddOrDeductNow(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: "add" | "deduct",
  action: VaultAction,
  rawTranscript: string
): Promise<VaultVoiceResult> {
  const relatedItemId = type === "deduct" ? await linkTransactionToInventoryItem(supabase, userId, action.comment ?? action.category) : null;

  const result = await recordVaultTransaction(supabase, userId, {
    type,
    amount: action.amount!,
    category: action.category,
    comment: action.comment,
    source: "voice",
    voiceCommand: rawTranscript,
    normalizedIntent: type === "add" ? "add_money" : "deduct_money",
    relatedItemId,
  });
  if (!result.ok) return { kind: "vault-error", message: result.error };

  const sign = type === "deduct" ? "−" : "+";
  const catPart = result.transaction.category ? ` · ${result.transaction.category}` : "";
  return {
    kind: "vault-executed",
    intent: type === "add" ? "add_money" : "deduct_money",
    message: `${sign} ${inr(result.transaction.amount)}${catPart}`,
    amount: result.transaction.amount,
    category: result.transaction.category,
    comment: result.transaction.comment,
    balance: result.balance,
    transactionId: result.transaction.id,
  };
}

async function handleAddOrDeduct(
  supabase: SupabaseClient<Database>,
  userId: string,
  type: "add" | "deduct",
  action: VaultAction,
  rawTranscript: string
): Promise<VaultVoiceResult> {
  if (action.amount == null) {
    return {
      kind: "vault-clarify",
      question: type === "add" ? "How much should I add?" : "How much should I deduct?",
      pendingAction: action,
      pendingKind: "clarify-amount",
    };
  }

  const summary = await getVaultSummary(supabase, userId);
  const recentAmounts = summary.transactions.slice(0, 20).map((t) => t.amount);
  if (isUnusuallyLargeAmount(action.amount, recentAmounts)) {
    return {
      kind: "vault-confirm",
      message: `${inr(action.amount)} is a large ${type === "add" ? "deposit" : "deduction"}. Do you want me to continue?`,
      pendingAction: action,
      pendingKind: "confirm-large",
    };
  }

  return executeAddOrDeductNow(supabase, userId, type, action, rawTranscript);
}

async function handleCheckBalance(supabase: SupabaseClient<Database>, userId: string): Promise<VaultVoiceResult> {
  const summary = await getVaultSummary(supabase, userId);
  return { kind: "vault-answer", intent: "check_balance", message: `You have ${inr(summary.balance)} in your vault.`, amount: summary.balance };
}

async function handleCheckTotalSaved(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction
): Promise<VaultVoiceResult> {
  const range = action.datePhrase ? (parseDateRange(action.datePhrase) ?? undefined) : undefined;
  const insights = await computeSpendingInsights(supabase, userId, range);
  const label = range ? ` ${range.label}` : "";
  return {
    kind: "vault-answer",
    intent: "check_total_saved",
    message: `You've added ${inr(insights.totalAdded)}${label}.`,
    amount: insights.totalAdded,
  };
}

/**
 * Combined vault+inventory query — "how much did I spend on the TV?" names a
 * physical item rather than (or alongside) a vault category. Resolves the
 * item read-only against inventory (never creates/edits it — see AGENTS
 * section 16) and sums deductions linked to it either via the persisted
 * related_item_id (see linkTransactionToInventoryItem) or a plain text match
 * against the transaction's comment/category, for transactions recorded
 * before the item existed or without a confident link.
 */
async function handleCheckSpendingForItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  itemEntity: string,
  range: DateRange | undefined
): Promise<VaultVoiceResult> {
  const { data: items } = await supabase.from("items").select("id, name").eq("user_id", userId);
  const matchedItem = items && items.length ? fuzzyMatchByName(itemEntity, items) : null;

  const rows = await findVaultTransactions(supabase, userId, { type: "deduct", range, limit: 500 });
  const needle = itemEntity.toLowerCase();
  const matches = rows.filter((t) => {
    if (matchedItem && t.related_item_id === matchedItem.id) return true;
    const haystack = `${t.comment ?? ""} ${t.category ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });

  const itemLabel = matchedItem?.name ?? itemEntity;
  const dateLabel = range ? ` ${range.label}` : "";
  if (matches.length === 0) {
    return { kind: "vault-answer", intent: "check_spending", message: `I couldn't find any spending linked to "${itemLabel}"${dateLabel}.` };
  }

  const total = matches.reduce((sum, t) => sum + t.amount, 0);
  return {
    kind: "vault-answer",
    intent: "check_spending",
    message: `You spent ${inr(total)} on ${itemLabel}${dateLabel}.`,
    amount: total,
  };
}

async function handleCheckSpending(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction
): Promise<VaultVoiceResult> {
  const range = action.datePhrase ? (parseDateRange(action.datePhrase) ?? undefined) : undefined;

  if (action.itemEntity) {
    return handleCheckSpendingForItem(supabase, userId, action.itemEntity, range);
  }

  const insights = await computeSpendingInsights(supabase, userId, range);

  let total = insights.totalSpent;
  let categoryLabel = "";
  if (action.category) {
    const row = insights.byCategory.find((c) => c.category === action.category);
    total = row ? row.total : 0;
    categoryLabel = ` on ${action.category}`;
  }
  const dateLabel = range ? ` ${range.label}` : "";
  return {
    kind: "vault-answer",
    intent: "check_spending",
    message: `You spent ${inr(total)}${categoryLabel}${dateLabel}.`,
    amount: total,
  };
}

async function handleViewHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction
): Promise<VaultVoiceResult> {
  const range = action.datePhrase ? (parseDateRange(action.datePhrase) ?? undefined) : undefined;
  const rows = await findVaultTransactions(supabase, userId, { category: action.category ?? undefined, range, limit: 10 });
  const label = range ? ` ${range.label}` : "";
  return {
    kind: "vault-history",
    message: rows.length ? `Here's your history${label}.` : `No transactions found${label}.`,
    transactions: rows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      category: t.category,
      comment: t.comment,
      createdAt: t.created_at,
    })),
  };
}

async function handleUndo(
  supabase: SupabaseClient<Database>,
  userId: string,
  session: VaultSessionContext | null
): Promise<VaultVoiceResult> {
  let target: VaultTransaction | null = null;
  if (session?.lastTransaction) target = await getTransactionById(supabase, userId, session.lastTransaction.id);
  if (!target) target = await getMostRecentTransaction(supabase, userId, {});
  if (!target) return { kind: "vault-error", message: "There's nothing to undo." };

  const result = await deleteVaultTransaction(supabase, userId, target.id);
  if (!result.ok) return { kind: "vault-error", message: result.error };
  return { kind: "vault-executed", intent: "undo_transaction", message: `Undone — ${describeTxn(target)} removed.`, balance: result.balance };
}

async function handleEdit(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction,
  session: VaultSessionContext | null
): Promise<VaultVoiceResult> {
  const { transaction: target, candidates } = await resolveReferencedTransaction(supabase, userId, action.reference, session);

  if (!target && candidates.length > 1) {
    return {
      kind: "vault-disambiguate",
      message: `I found ${candidates.length} recent matching transactions. Which one do you mean?`,
      options: candidates.map((c) => ({ id: c.id, label: `${describeTxn(c)} — ${new Date(c.created_at).toLocaleDateString("en-IN")}` })),
      pendingAction: action,
      pendingKind: "disambiguate",
    };
  }
  if (!target) return { kind: "vault-error", message: "I couldn't find that transaction to change." };

  if (action.newAmount == null && action.newCategory == null) {
    return { kind: "vault-clarify", question: "What should I change it to?", pendingAction: action, pendingKind: "clarify-amount" };
  }

  const result = await updateVaultTransaction(supabase, userId, target.id, {
    amount: action.newAmount ?? undefined,
    category: action.newCategory ?? undefined,
  });
  if (!result.ok) return { kind: "vault-error", message: result.error };
  return {
    kind: "vault-executed",
    intent: "edit_transaction",
    message: `Updated to ${describeTxn(result.transaction)}.`,
    balance: result.balance,
    transactionId: result.transaction.id,
  };
}

async function handleDelete(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction,
  session: VaultSessionContext | null
): Promise<VaultVoiceResult> {
  const { transaction: target, candidates } = await resolveReferencedTransaction(supabase, userId, action.reference, session);

  if (!target && candidates.length > 1) {
    return {
      kind: "vault-disambiguate",
      message: `I found ${candidates.length} recent matching transactions. Which one do you want to delete?`,
      options: candidates.map((c) => ({ id: c.id, label: `${describeTxn(c)} — ${new Date(c.created_at).toLocaleDateString("en-IN")}` })),
      pendingAction: action,
      pendingKind: "disambiguate",
    };
  }
  if (!target) return { kind: "vault-error", message: "I couldn't find that transaction to delete." };

  const result = await deleteVaultTransaction(supabase, userId, target.id);
  if (!result.ok) return { kind: "vault-error", message: result.error };
  return { kind: "vault-executed", intent: "delete_transaction", message: `Deleted — ${describeTxn(target)}.`, balance: result.balance };
}

async function handleSetRecurring(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction
): Promise<VaultVoiceResult> {
  const r = action.recurring;
  if (!r || r.amount == null) {
    return {
      kind: "vault-clarify",
      question: "How much should I save automatically each month?",
      pendingAction: action,
      pendingKind: "clarify-amount",
    };
  }

  const result = await upsertRecurringPlan(supabase, userId, {
    amount: r.amount,
    scheduleMode: r.scheduleMode ?? "salary",
    dayOfMonth: r.dayOfMonth ?? 1,
    enabled: r.enabled ?? true,
  });
  if (!result.ok) return { kind: "vault-error", message: result.error };

  return {
    kind: "vault-executed",
    intent: "set_recurring",
    message: result.plan.enabled ? `Recurring savings set — ${inr(result.plan.amount)}/month.` : "Recurring savings paused.",
  };
}

async function handleInsight(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction
): Promise<VaultVoiceResult> {
  const range = action.datePhrase ? (parseDateRange(action.datePhrase) ?? undefined) : undefined;
  const insights = await computeSpendingInsights(supabase, userId, range);
  if (!insights.biggestCategory) {
    return { kind: "vault-answer", intent: "vault_insight", message: "You don't have any spending recorded yet." };
  }

  const top3 = insights.byCategory
    .slice(0, 3)
    .map((c) => `${c.category} ${inr(c.total)}`)
    .join(", ");
  return {
    kind: "vault-answer",
    intent: "vault_insight",
    message: `Most of your money went to ${insights.biggestCategory.category} (${inr(insights.biggestCategory.total)}).`,
    detail: top3,
  };
}

function handleHelp(): VaultVoiceResult {
  return {
    kind: "vault-answer",
    intent: "help",
    message:
      'Just talk to me naturally — try "I spent 500 on groceries", "how much do I have?", "undo that", "how much did I spend this month?", or "add 5000 to my vault".',
  };
}

async function executeVaultAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: VaultAction,
  session: VaultSessionContext | null,
  rawTranscript: string
): Promise<VaultVoiceResult> {
  switch (action.intent) {
    case "add_money":
      return handleAddOrDeduct(supabase, userId, "add", action, rawTranscript);
    case "deduct_money":
      return handleAddOrDeduct(supabase, userId, "deduct", action, rawTranscript);
    case "check_balance":
      return handleCheckBalance(supabase, userId);
    case "check_total_saved":
      return handleCheckTotalSaved(supabase, userId, action);
    case "check_spending":
      return handleCheckSpending(supabase, userId, action);
    case "view_history":
      return handleViewHistory(supabase, userId, action);
    case "undo_transaction":
      return handleUndo(supabase, userId, session);
    case "edit_transaction":
      return handleEdit(supabase, userId, action, session);
    case "delete_transaction":
      return handleDelete(supabase, userId, action, session);
    case "set_recurring":
      return handleSetRecurring(supabase, userId, action);
    case "vault_insight":
      return handleInsight(supabase, userId, action);
    case "help":
      return handleHelp();
    default:
      return { kind: "vault-error", message: "I'm not sure how to do that yet." };
  }
}

async function handleConfirmReply(
  supabase: SupabaseClient<Database>,
  userId: string,
  transcript: string,
  pending: VaultPendingState
): Promise<VaultVoiceResult> {
  const text = transcript.trim();
  if (NEGATIVE_RE.test(text)) {
    return { kind: "vault-answer", intent: pending.action.intent, message: "Okay, cancelled." };
  }
  if (AFFIRMATIVE_RE.test(text)) {
    return executeAddOrDeductNow(
      supabase,
      userId,
      pending.action.intent === "add_money" ? "add" : "deduct",
      pending.action,
      `(confirmed) ${transcript}`
    );
  }
  return { kind: "vault-confirm", message: "Sorry, should I go ahead? (yes/no)", pendingAction: pending.action, pendingKind: "confirm-large" };
}

async function handleDisambiguateReply(
  supabase: SupabaseClient<Database>,
  userId: string,
  transcript: string,
  pending: VaultPendingState
): Promise<VaultVoiceResult> {
  const text = transcript.trim().toLowerCase();
  const options = pending.options ?? [];

  const ordinal = /\b(first|1st|one)\b/.test(text) ? 0 : /\b(second|2nd|two)\b/.test(text) ? 1 : /\b(third|3rd|three)\b/.test(text) ? 2 : null;
  let chosen = ordinal != null ? options[ordinal] : null;
  if (!chosen) {
    chosen = options.find((o) => text.includes(o.label.toLowerCase().replace(/[₹,]/g, ""))) ?? null;
  }
  if (!chosen) {
    return {
      kind: "vault-disambiguate",
      message: "Sorry, which one did you mean?",
      options,
      pendingAction: pending.action,
      pendingKind: "disambiguate",
    };
  }

  const action = pending.action;
  if (action.intent === "delete_transaction") {
    const result = await deleteVaultTransaction(supabase, userId, chosen.id);
    if (!result.ok) return { kind: "vault-error", message: result.error };
    return { kind: "vault-executed", intent: "delete_transaction", message: `Deleted — ${chosen.label}.`, balance: result.balance };
  }

  if (action.newAmount == null && action.newCategory == null) {
    return {
      kind: "vault-clarify",
      question: "What should I change it to?",
      pendingAction: { ...action, reference: { ordinal: null, kind: null, category: null, datePhrase: null } },
      pendingKind: "clarify-amount",
    };
  }
  const result = await updateVaultTransaction(supabase, userId, chosen.id, {
    amount: action.newAmount ?? undefined,
    category: action.newCategory ?? undefined,
  });
  if (!result.ok) return { kind: "vault-error", message: result.error };
  return {
    kind: "vault-executed",
    intent: "edit_transaction",
    message: `Updated — ${describeTxn(result.transaction)}.`,
    balance: result.balance,
    transactionId: result.transaction.id,
  };
}

/**
 * Entry point for the vault domain. `preParsed` lets the caller (voice.ts)
 * skip a redundant Gemini call when it already classified the transcript as
 * "vault" with no active pending conversation — otherwise this re-parses
 * with the right pending-question/last-transaction context injected so
 * follow-up replies ("groceries", "yes", "actually make that 4000") resolve
 * correctly.
 */
export async function processVaultVoiceCommand(
  transcript: string,
  sessionContext: VaultSessionContext | null,
  preParsed?: Extract<NluResult, { intent: "vault" }>
): Promise<VaultVoiceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "vault-error", message: "Not authenticated." };

  const pending = sessionContext?.pending ?? null;

  if (pending?.kind === "confirm-large") return handleConfirmReply(supabase, user.id, transcript, pending);
  if (pending?.kind === "disambiguate") return handleDisambiguateReply(supabase, user.id, transcript, pending);

  let actions: VaultAction[];
  if (preParsed) {
    actions = preParsed.actions;
  } else {
    const geminiContext = buildGeminiContext(pending, sessionContext);
    const nlu = await parseTranscript(transcript, geminiContext);
    if (nlu.intent === "vault") {
      actions = nlu.actions;
    } else if (pending && (pending.kind === "clarify-amount" || pending.kind === "clarify-category")) {
      const filled = fillPendingSlotHeuristically(transcript, pending);
      if (!filled) {
        return {
          kind: "vault-clarify",
          question: pending.kind === "clarify-amount" ? "Sorry, I still need an amount — how much?" : "Sorry, what was it for?",
          pendingAction: pending.action,
          pendingKind: pending.kind,
        };
      }
      actions = [filled];
    } else {
      return { kind: "vault-error", message: "I didn't catch a vault command there." };
    }
  }

  if (actions.length === 0) return { kind: "vault-error", message: "I didn't catch that." };

  const first = pending ? mergeWithPendingAction(actions[0], pending.action) : actions[0];
  const firstResult = await executeVaultAction(supabase, user.id, first, sessionContext, transcript);

  if (firstResult.kind !== "vault-executed" || actions.length < 2) return firstResult;

  // Multi-intent: only chain the second action once the first executed cleanly.
  const secondResult = await executeVaultAction(supabase, user.id, actions[1], sessionContext, transcript);
  if (secondResult.kind === "vault-executed" || secondResult.kind === "vault-answer") {
    return { ...firstResult, message: `${firstResult.message} ${secondResult.message}`.trim() };
  }
  return firstResult;
}
