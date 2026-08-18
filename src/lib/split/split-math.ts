import type { SplitShareType } from "@/lib/supabase/types";

export interface SplitParticipantInput {
  userId: string;
  /** Exact amount (for "exact"), percentage 0-100 (for "percentage"), or share count (for "shares"). Ignored for "equal". */
  value?: number;
}

export interface SplitParticipantResult {
  userId: string;
  shareType: SplitShareType;
  shareValue: number | null;
  owedAmount: number;
}

const EPSILON = 0.01;

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * Rounds every entry to paise while keeping the sum exactly equal to `total`
 * — the largest share absorbs the rounding remainder, so an equal 3-way
 * split of ₹100 comes out ₹33.34/₹33.33/₹33.33 rather than leaving a stray
 * ₹0.01 nobody's owed.
 */
function distributeByWeight(total: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  const rounded = weights.map((w) => Math.round(((total * w) / totalWeight) * 100) / 100);
  const drift = Math.round((total - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (drift !== 0 && rounded.length > 0) {
    const maxIdx = rounded.reduce((best, v, i) => (v > rounded[best] ? i : best), 0);
    rounded[maxIdx] = Math.round((rounded[maxIdx] + drift) * 100) / 100;
  }
  return rounded;
}

/**
 * Turns raw split-method inputs into a validated per-participant breakdown
 * that always sums to exactly `amount` — the UI never calculates a balance
 * by hand, and record_split_expense() re-validates this same sum
 * server-side regardless (defense in depth, see supabase/schema.sql).
 */
export function computeSplit(
  amount: number,
  method: SplitShareType,
  participants: SplitParticipantInput[]
): SplitParticipantResult[] | { error: string } {
  if (participants.length === 0) return { error: "Add at least one participant." };

  if (method === "equal") {
    const amounts = distributeByWeight(amount, participants.map(() => 1));
    return participants.map((p, i) => ({ userId: p.userId, shareType: "equal" as const, shareValue: null, owedAmount: amounts[i] }));
  }

  if (method === "exact") {
    const values = participants.map((p) => p.value ?? 0);
    if (values.some((v) => v <= 0)) return { error: "Every participant needs an amount greater than zero." };
    const sum = Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
    if (Math.abs(sum - amount) > EPSILON) {
      return { error: `Amounts add up to ${inr(sum)}, not the total ${inr(amount)}.` };
    }
    return participants.map((p, i) => ({ userId: p.userId, shareType: "exact" as const, shareValue: values[i], owedAmount: values[i] }));
  }

  if (method === "percentage") {
    const pcts = participants.map((p) => p.value ?? 0);
    if (pcts.some((v) => v <= 0)) return { error: "Every participant needs a percentage greater than zero." };
    const sum = Math.round(pcts.reduce((a, b) => a + b, 0) * 100) / 100;
    if (Math.abs(sum - 100) > EPSILON) {
      return { error: `Percentages add up to ${sum}%, not 100%.` };
    }
    const amounts = distributeByWeight(amount, pcts);
    return participants.map((p, i) => ({ userId: p.userId, shareType: "percentage" as const, shareValue: pcts[i], owedAmount: amounts[i] }));
  }

  // shares
  const shares = participants.map((p) => p.value ?? 0);
  if (shares.some((v) => v <= 0)) return { error: "Every participant needs at least 1 share." };
  const amounts = distributeByWeight(amount, shares);
  return participants.map((p, i) => ({ userId: p.userId, shareType: "shares" as const, shareValue: shares[i], owedAmount: amounts[i] }));
}

export interface SimplifiedTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/**
 * Greedy min-cash-flow debt simplification: repeatedly matches the largest
 * creditor with the largest debtor until every net balance is settled.
 * Pure arithmetic, no AI involved — preserves everyone's final net position
 * while minimizing the number of repayment transactions needed to get there.
 */
export function simplifyDebts(netByUser: Map<string, number>): SimplifiedTransfer[] {
  const creditors: { userId: string; amount: number }[] = [];
  const debtors: { userId: string; amount: number }[] = [];
  for (const [userId, net] of netByUser) {
    if (net > EPSILON) creditors.push({ userId, amount: net });
    else if (net < -EPSILON) debtors.push({ userId, amount: -net });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: SimplifiedTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.round(Math.min(c.amount, d.amount) * 100) / 100;
    if (amount > EPSILON) {
      transfers.push({ fromUserId: d.userId, toUserId: c.userId, amount });
      c.amount = Math.round((c.amount - amount) * 100) / 100;
      d.amount = Math.round((d.amount - amount) * 100) / 100;
    }
    if (c.amount <= EPSILON) ci++;
    if (d.amount <= EPSILON) di++;
  }
  return transfers;
}
