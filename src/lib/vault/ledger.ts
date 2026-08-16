import type { SupabaseClient } from "@supabase/supabase-js";
import { fuzzyMatchByName } from "@/lib/voice/synonyms";
import type { DateRange } from "@/lib/vault/date-range";
import type { Database, VaultTransaction, VaultTransactionSource, VaultTransactionType } from "@/lib/supabase/types";

export interface VaultSummary {
  balance: number;
  totalAdded: number;
  totalDeducted: number;
  transactions: VaultTransaction[];
}

/**
 * The balance is always derived from the ledger, never cached, so the UI
 * can never drift from what's actually in transaction history.
 */
export async function getVaultSummary(supabase: SupabaseClient<Database>, userId: string): Promise<VaultSummary> {
  const { data, error } = await supabase
    .from("vault_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("vault: failed to load vault_transactions —", error.message, error.code ? `(${error.code})` : "");
  }

  const transactions = data ?? [];
  let balance = 0;
  let totalAdded = 0;
  let totalDeducted = 0;
  for (const t of transactions) {
    if (t.type === "deduct") {
      balance -= t.amount;
      totalDeducted += t.amount;
    } else {
      balance += t.amount;
      totalAdded += t.amount;
    }
  }

  return { balance, totalAdded, totalDeducted, transactions };
}

export interface RecordTransactionInput {
  type: VaultTransactionType;
  amount: number;
  category?: string | null;
  comment?: string | null;
  label?: string | null;
  source?: VaultTransactionSource;
  voiceCommand?: string | null;
  normalizedIntent?: string | null;
  /** Best-effort link to a matching inventory item — see linkTransactionToInventoryItem. */
  relatedItemId?: string | null;
}

export type RecordTransactionResult =
  | { ok: true; transaction: VaultTransaction; balance: number }
  | { ok: false; error: string; balance?: number };

/** Inserts a ledger row after re-checking the balance server-side — the balance can never go negative. */
export async function recordVaultTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: RecordTransactionInput
): Promise<RecordTransactionResult> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid amount." };
  }

  const summary = await getVaultSummary(supabase, userId);
  if (input.type === "deduct" && amount > summary.balance) {
    return {
      ok: false,
      error: `Insufficient vault balance. You currently have ₹${Math.round(summary.balance).toLocaleString("en-IN")} available.`,
      balance: summary.balance,
    };
  }

  const { data, error } = await supabase
    .from("vault_transactions")
    .insert({
      user_id: userId,
      type: input.type,
      amount,
      category: input.category?.trim() || null,
      comment: input.comment?.trim() || null,
      label: input.label?.trim() || null,
      source: input.source ?? "manual",
      voice_command: input.voiceCommand?.trim() || null,
      normalized_intent: input.normalizedIntent ?? null,
      related_item_id: input.relatedItemId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("vault: failed to insert vault_transactions row —", error?.message, error?.code ? `(${error.code})` : "");
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const balance = input.type === "deduct" ? summary.balance - amount : summary.balance + amount;
  return { ok: true, transaction: data, balance };
}

export interface TransactionFilters {
  type?: VaultTransactionType;
  /** Loose match — also checks the label/comment text so "the grocery transaction" still finds category-less rows. */
  category?: string;
  range?: DateRange;
  limit?: number;
}

/** Read-only lookup used both for "show me my history" style queries and for resolving references like "the grocery transaction from today". */
export async function findVaultTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
  filters: TransactionFilters = {}
): Promise<VaultTransaction[]> {
  let query = supabase.from("vault_transactions").select("*").eq("user_id", userId);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.range) {
    query = query.gte("created_at", filters.range.from.toISOString()).lte("created_at", filters.range.to.toISOString());
  }
  query = query.order("created_at", { ascending: false }).limit(filters.limit ?? 20);

  const { data, error } = await query;
  if (error) {
    console.error("vault: failed to query vault_transactions —", error.message);
    return [];
  }

  let rows = data ?? [];
  if (filters.category) {
    const needle = filters.category.toLowerCase();
    rows = rows.filter(
      (t) =>
        t.category?.toLowerCase() === needle ||
        t.category?.toLowerCase().includes(needle) ||
        t.comment?.toLowerCase().includes(needle) ||
        t.label?.toLowerCase().includes(needle)
    );
  }

  return rows;
}

export async function getMostRecentTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  filters: Omit<TransactionFilters, "limit"> = {}
): Promise<VaultTransaction | null> {
  const rows = await findVaultTransactions(supabase, userId, { ...filters, limit: 1 });
  return rows[0] ?? null;
}

export async function getTransactionById(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string
): Promise<VaultTransaction | null> {
  const { data } = await supabase.from("vault_transactions").select("*").eq("user_id", userId).eq("id", transactionId).maybeSingle();
  return data ?? null;
}

export interface UpdateTransactionPatch {
  amount?: number;
  category?: string | null;
  comment?: string | null;
  type?: VaultTransactionType;
}

export type MutateTransactionResult =
  | { ok: true; transaction: VaultTransaction; balance: number }
  | { ok: false; error: string };

/** True edit — recomputes the balance impact (old effect removed, new effect applied) before allowing it to go through. */
export async function updateVaultTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string,
  patch: UpdateTransactionPatch
): Promise<MutateTransactionResult> {
  const summary = await getVaultSummary(supabase, userId);
  const existing = summary.transactions.find((t) => t.id === transactionId);
  if (!existing) return { ok: false, error: "I couldn't find that transaction." };

  const newType = patch.type ?? existing.type;
  const newAmount = patch.amount != null ? Math.round(patch.amount * 100) / 100 : existing.amount;
  if (!Number.isFinite(newAmount) || newAmount <= 0) return { ok: false, error: "Enter a valid amount." };

  const oldEffect = existing.type === "deduct" ? -existing.amount : existing.amount;
  const newEffect = newType === "deduct" ? -newAmount : newAmount;
  const projectedBalance = summary.balance - oldEffect + newEffect;
  if (projectedBalance < 0) {
    return {
      ok: false,
      error: `That change would put your vault below zero (₹${Math.round(projectedBalance).toLocaleString("en-IN")}). Try a smaller amount.`,
    };
  }

  const { data, error } = await supabase
    .from("vault_transactions")
    .update({
      type: newType,
      amount: newAmount,
      category: patch.category !== undefined ? patch.category?.trim() || null : existing.category,
      comment: patch.comment !== undefined ? patch.comment?.trim() || null : existing.comment,
    })
    .eq("id", transactionId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("vault: failed to update vault_transactions row —", error?.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true, transaction: data, balance: projectedBalance };
}

/** True delete — the row is gone, not offset by a reversal entry. */
export async function deleteVaultTransaction(
  supabase: SupabaseClient<Database>,
  userId: string,
  transactionId: string
): Promise<MutateTransactionResult> {
  const summary = await getVaultSummary(supabase, userId);
  const existing = summary.transactions.find((t) => t.id === transactionId);
  if (!existing) return { ok: false, error: "I couldn't find that transaction." };

  const { error } = await supabase.from("vault_transactions").delete().eq("id", transactionId).eq("user_id", userId);
  if (error) {
    console.error("vault: failed to delete vault_transactions row —", error.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const removedEffect = existing.type === "deduct" ? -existing.amount : existing.amount;
  return { ok: true, transaction: existing, balance: summary.balance - removedEffect };
}

export interface SpendingInsights {
  range: DateRange | null;
  totalSpent: number;
  totalAdded: number;
  byCategory: { category: string; total: number }[];
  biggestCategory: { category: string; total: number } | null;
}

/** Always computed live from the ledger — never invents a number the user's transactions don't support. */
export async function computeSpendingInsights(
  supabase: SupabaseClient<Database>,
  userId: string,
  range?: DateRange
): Promise<SpendingInsights> {
  const rows = await findVaultTransactions(supabase, userId, { range, limit: 5000 });

  let totalSpent = 0;
  let totalAdded = 0;
  const byCategoryMap = new Map<string, number>();
  for (const t of rows) {
    if (t.type === "deduct") {
      totalSpent += t.amount;
      const key = t.category ?? "Other";
      byCategoryMap.set(key, (byCategoryMap.get(key) ?? 0) + t.amount);
    } else {
      totalAdded += t.amount;
    }
  }

  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  return {
    range: range ?? null,
    totalSpent,
    totalAdded,
    byCategory,
    biggestCategory: byCategory[0] ?? null,
  };
}

/**
 * "Large" is always relative to the user's own recent activity, not a fixed
 * cutoff — a ₹5,000 transaction should raise an eyebrow for someone whose
 * typical amount is ₹500, even though it wouldn't for someone who regularly
 * moves ₹50,000. Only brand-new vaults with no history fall back to a flat
 * threshold, since there's nothing yet to compare against.
 */
export function isUnusuallyLargeAmount(amount: number, recentAmounts: number[]): boolean {
  if (recentAmounts.length === 0) return amount > 20000;
  const avg = recentAmounts.reduce((a, b) => a + b, 0) / recentAmounts.length;
  return amount > avg * 4;
}

/**
 * Best-effort, read-only cross-reference: if a spending comment/category
 * text matches an existing inventory item closely enough, link the two so
 * "how much did I spend on the new TV?" can be answered later. Never
 * creates or modifies inventory items — see AGENTS section 16.
 */
export async function linkTransactionToInventoryItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  text: string | null
): Promise<string | null> {
  if (!text || !text.trim()) return null;

  const { data: items } = await supabase.from("items").select("id, name").eq("user_id", userId);
  if (!items || items.length === 0) return null;

  const match = fuzzyMatchByName(text, items);
  return match ? match.id : null;
}
