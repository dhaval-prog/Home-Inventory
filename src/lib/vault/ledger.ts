import type { SupabaseClient } from "@supabase/supabase-js";
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
  const { data } = await supabase
    .from("vault_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

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
    })
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: "Something went wrong. Please try again." };

  const balance = input.type === "deduct" ? summary.balance - amount : summary.balance + amount;
  return { ok: true, transaction: data, balance };
}
