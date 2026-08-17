"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import { getHouseholdContext } from "@/lib/actions/household";
import { describeActivity } from "@/lib/household-activity-messages";
import { computeSplit, simplifyDebts, type SplitParticipantInput, type SimplifiedTransfer } from "@/lib/split/split-math";
import type { SplitExpense, SplitExpenseParticipant, SplitSettlement, SplitShareType, SplitSettlementMethod } from "@/lib/supabase/types";

/**
 * Let's Split — shared-expense splitting. Deliberately separate from the
 * household vault/goals ledger (see supabase/schema.sql's "Let's Split"
 * section): balances here are never stored, always derived live from
 * split_expense_participants + split_settlements, mirroring how
 * household-goals.ts/getVaultSummary already derive savings balances.
 *
 * For now every household has exactly one implicit split group
 * ("Household Expenses", auto-created/backfilled — see getDefaultGroupId).
 * Named sub-groups (e.g. "Goa Trip") are supported by the schema but not
 * yet surfaced in the UI.
 */

export interface SplitMemberBalance {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** From the CURRENT viewer's perspective: positive = this member owes the viewer; negative = the viewer owes this member; ~0 = settled up. */
  netAmount: number;
}

export interface SplitExpenseSummary {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  payerId: string;
  payerName: string;
  participantCount: number;
  expenseDate: string;
  createdAt: string;
  /** True once none of this expense's participants still net-owe the payer (considering all expenses/settlements between them, not just this one — settling up is always against the overall balance, the same way Splitwise itself works, never earmarked to one expense). */
  settled: boolean;
}

export interface SplitSummary {
  groupId: string;
  youOwe: number;
  youAreOwed: number;
  net: number;
  memberBalances: SplitMemberBalance[];
  recentExpenses: SplitExpenseSummary[];
}

export interface SplitExpenseParticipantDetail {
  userId: string;
  name: string;
  shareType: SplitShareType;
  shareValue: number | null;
  owedAmount: number;
  isPayer: boolean;
}

export interface SplitExpenseDetail {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  category: string | null;
  paidBy: string;
  paidByName: string;
  expenseDate: string;
  comment: string | null;
  receiptUrl: string | null;
  splitMethod: SplitShareType;
  createdBy: string;
  canEdit: boolean;
  participants: SplitExpenseParticipantDetail[];
}

export interface CreateExpenseInput {
  description: string;
  amount: number;
  category: string | null;
  paidBy: string;
  expenseDate?: string | null;
  comment?: string | null;
  splitMethod: SplitShareType;
  participants: SplitParticipantInput[];
}

export interface RecordSettlementInput {
  otherUserId: string;
  amount: number;
  method: SplitSettlementMethod;
  comment?: string | null;
  /** true = the caller paid otherUserId; false = otherUserId paid the caller. */
  iPaid: boolean;
}

export interface SimplifiedTransferWithNames extends SimplifiedTransfer {
  fromName: string;
  toName: string;
}

/** The household's one default split group — auto-created by handle_new_household()/backfilled for existing households, so this should never return null in practice. */
export async function getDefaultGroupId(householdId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("split_groups").select("id").eq("household_id", householdId).eq("is_default", true).maybeSingle();
  return data?.id ?? null;
}

export interface SplitGroupMemberInfo {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isCreator: boolean;
}

/**
 * The split group's own membership + display names — deliberately NOT
 * sourced from getHouseholdContext()/household_members, which a split_only
 * member (SPLIT_ACCESS but not HOME_ACCESS — see has_home_access() in
 * supabase/schema.sql) can no longer see the full roster of. split_members
 * is scoped to is_split_group_member() instead, so this works the same for
 * every group member regardless of their household-wide role. Membership
 * here is explicit-only now (see supabase/schema.sql — the old
 * household-wide auto-sync trigger was removed): only the group's creator
 * plus whoever's been added via addSplitGroupMember() below.
 */
export async function getSplitGroupMembers(groupId: string): Promise<SplitGroupMemberInfo[]> {
  const supabase = await createClient();
  const [{ data: group }, { data: members }] = await Promise.all([
    supabase.from("split_groups").select("created_by").eq("id", groupId).maybeSingle(),
    supabase.from("split_members").select("user_id").eq("group_id", groupId),
  ]);
  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return userIds.map((id) => ({
    userId: id,
    name: displayName(profileById.get(id)),
    avatarUrl: profileById.get(id)?.avatar_url ?? null,
    isCreator: id === group?.created_by,
  }));
}

/**
 * Household members not yet in this split group — the candidate list for
 * Let's Split's own "Invite Members" action. Only meaningful for someone who
 * can already see the full household roster (the group's manager, who by
 * definition has HOME_ACCESS); a non-manager gets an empty list.
 */
export async function listEligibleSplitGroupMembers(groupId: string, householdId: string): Promise<SplitGroupMemberInfo[]> {
  const context = await getHouseholdContext(householdId);
  if (!context) return [];

  const supabase = await createClient();
  const { data: members } = await supabase.from("split_members").select("user_id").eq("group_id", groupId);
  const existingIds = new Set((members ?? []).map((m) => m.user_id));

  return context.members
    .filter((m) => !existingIds.has(m.userId))
    .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, isCreator: false }));
}

export async function addSplitGroupMember(groupId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_split_group_member", { p_group_id: groupId, p_user_id: userId });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to add member" };

  revalidatePath("/household");
  return { ok: true };
}

export async function removeSplitGroupMember(groupId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_split_group_member", { p_group_id: groupId, p_user_id: userId });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to remove member" };

  revalidatePath("/household");
  return { ok: true };
}

export interface SplitActivityEntry {
  id: string;
  actorName: string;
  message: string;
  createdAt: string;
}

/**
 * The expense/settlement-only slice of household_activity — the one feed a
 * split_only member (SPLIT_ACCESS but not HOME_ACCESS) can see, via the
 * household_activity_select_split_activity RLS policy. Filters client-side
 * too, so a full-access caller using the split workspace doesn't see
 * goal/contribution noise mixed in here either — this feed is scoped by
 * kind for everyone, not just by what RLS happens to allow a given role.
 */
export async function getSplitActivity(householdId: string): Promise<SplitActivityEntry[]> {
  const supabase = await createClient();
  const groupId = await getDefaultGroupId(householdId);
  if (!groupId) return [];

  const [splitMembers, { data: activityRows }] = await Promise.all([
    getSplitGroupMembers(groupId),
    supabase.from("household_activity").select("*").eq("household_id", householdId).order("created_at", { ascending: false }).limit(20),
  ]);

  const nameByActor = new Map(splitMembers.map((m) => [m.userId, m.name]));
  const splitKinds = new Set(["expense_added", "expense_deleted", "settlement_recorded"]);
  return (activityRows ?? [])
    .filter((a) => splitKinds.has(a.kind))
    .map((a) => {
      const actorName = nameByActor.get(a.actor_user_id) ?? "Someone";
      return { id: a.id, actorName, message: describeActivity(a.kind, actorName, a.payload), createdAt: a.created_at };
    });
}

// ─────────────────────────────────────────────────────────────
// Balance derivation — pure functions over raw rows, no DB access, so the
// same math backs getSplitSummary, getSimplifiedBalances, and (in tests)
// can be exercised without a database at all.
// ─────────────────────────────────────────────────────────────

type OwesMap = Map<string, Map<string, number>>;

function addOwed(owes: OwesMap, debtor: string, creditor: string, amount: number) {
  if (debtor === creditor || amount <= 0) return;
  if (!owes.has(debtor)) owes.set(debtor, new Map());
  const m = owes.get(debtor)!;
  m.set(creditor, (m.get(creditor) ?? 0) + amount);
}

function buildOwesMap(
  expenses: SplitExpense[],
  participantsByExpense: Map<string, SplitExpenseParticipant[]>,
  settlements: SplitSettlement[]
): OwesMap {
  const owes: OwesMap = new Map();
  for (const e of expenses) {
    for (const p of participantsByExpense.get(e.id) ?? []) {
      if (p.user_id === e.paid_by) continue;
      addOwed(owes, p.user_id, e.paid_by, p.owed_amount);
    }
  }
  for (const s of settlements) {
    // from_user paid to_user -> from_user's debt to to_user shrinks, which
    // is the same ledger effect as to_user owing from_user that amount.
    addOwed(owes, s.to_user, s.from_user, s.amount);
  }
  return owes;
}

/** Positive = `a` owes `b`; negative = `b` owes `a`; ~0 = settled between this pair. */
function netBetween(owes: OwesMap, a: string, b: string): number {
  const aOwesB = owes.get(a)?.get(b) ?? 0;
  const bOwesA = owes.get(b)?.get(a) ?? 0;
  return Math.round((aOwesB - bOwesA) * 100) / 100;
}

function overallNetByUser(owes: OwesMap, memberIds: string[]): Map<string, number> {
  const net = new Map<string, number>(memberIds.map((id) => [id, 0]));
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i];
      const b = memberIds[j];
      const n = netBetween(owes, a, b); // positive => a owes b
      net.set(a, Math.round(((net.get(a) ?? 0) - n) * 100) / 100);
      net.set(b, Math.round(((net.get(b) ?? 0) + n) * 100) / 100);
    }
  }
  return net;
}

const EPSILON = 0.01;

export async function getSplitSummary(householdId: string): Promise<SplitSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const context = await getHouseholdContext(householdId);
  if (!context) return null;
  const groupId = await getDefaultGroupId(householdId);
  if (!groupId) return null;

  // Split group membership is no longer implied by household membership (see
  // supabase/schema.sql's "Let's Split membership is deliberately NOT
  // auto-synced" note) — a household member who hasn't been explicitly added
  // to this group gets null here, same as "not set up", rather than a
  // misleadingly empty-but-present dashboard.
  const { data: membership } = await supabase.from("split_members").select("user_id").eq("group_id", groupId).eq("user_id", user.id).maybeSingle();
  if (!membership) return null;

  const [{ data: expenses }, { data: settlements }, splitMembers] = await Promise.all([
    supabase.from("split_expenses").select("*").eq("group_id", groupId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("split_settlements").select("*").eq("group_id", groupId),
    getSplitGroupMembers(groupId),
  ]);

  const expenseRows = expenses ?? [];
  const settlementRows = settlements ?? [];

  const { data: participants } = expenseRows.length
    ? await supabase
        .from("split_expense_participants")
        .select("*")
        .in(
          "expense_id",
          expenseRows.map((e) => e.id)
        )
    : { data: [] };

  const participantsByExpense = new Map<string, SplitExpenseParticipant[]>();
  for (const p of participants ?? []) {
    const list = participantsByExpense.get(p.expense_id) ?? [];
    list.push(p);
    participantsByExpense.set(p.expense_id, list);
  }

  const owes = buildOwesMap(expenseRows, participantsByExpense, settlementRows);
  const memberIds = splitMembers.map((m) => m.userId);
  const nameById = new Map(splitMembers.map((m) => [m.userId, m.name]));
  const avatarById = new Map(splitMembers.map((m) => [m.userId, m.avatarUrl]));

  const memberBalances: SplitMemberBalance[] = memberIds
    .filter((id) => id !== user.id)
    .map((id) => ({
      userId: id,
      name: nameById.get(id) ?? "Member",
      avatarUrl: avatarById.get(id) ?? null,
      netAmount: netBetween(owes, id, user.id), // positive => they owe the viewer
    }));

  const youAreOwed = memberBalances.reduce((sum, m) => sum + Math.max(0, m.netAmount), 0);
  const youOwe = memberBalances.reduce((sum, m) => sum + Math.max(0, -m.netAmount), 0);

  const recentExpenses: SplitExpenseSummary[] = expenseRows.slice(0, 20).map((e) => {
    const parts = participantsByExpense.get(e.id) ?? [];
    const settled = parts.every((p) => p.user_id === e.paid_by || netBetween(owes, p.user_id, e.paid_by) <= EPSILON);
    return {
      id: e.id,
      description: e.description,
      amount: e.amount,
      category: e.category,
      payerId: e.paid_by,
      payerName: nameById.get(e.paid_by) ?? "Member",
      participantCount: parts.length,
      expenseDate: e.expense_date,
      createdAt: e.created_at,
      settled,
    };
  });

  return {
    groupId,
    youOwe: Math.round(youOwe * 100) / 100,
    youAreOwed: Math.round(youAreOwed * 100) / 100,
    net: Math.round((youAreOwed - youOwe) * 100) / 100,
    memberBalances,
    recentExpenses,
  };
}

export async function getSimplifiedBalances(householdId: string): Promise<SimplifiedTransferWithNames[]> {
  const supabase = await createClient();
  const groupId = await getDefaultGroupId(householdId);
  if (!groupId) return [];

  const [{ data: expenses }, { data: settlements }, splitMembers] = await Promise.all([
    supabase.from("split_expenses").select("*").eq("group_id", groupId),
    supabase.from("split_settlements").select("*").eq("group_id", groupId),
    getSplitGroupMembers(groupId),
  ]);
  const expenseRows = expenses ?? [];
  const { data: participants } = expenseRows.length
    ? await supabase
        .from("split_expense_participants")
        .select("*")
        .in(
          "expense_id",
          expenseRows.map((e) => e.id)
        )
    : { data: [] };

  const participantsByExpense = new Map<string, SplitExpenseParticipant[]>();
  for (const p of participants ?? []) {
    const list = participantsByExpense.get(p.expense_id) ?? [];
    list.push(p);
    participantsByExpense.set(p.expense_id, list);
  }

  const owes = buildOwesMap(expenseRows, participantsByExpense, settlements ?? []);
  const memberIds = splitMembers.map((m) => m.userId);
  const nameById = new Map(splitMembers.map((m) => [m.userId, m.name]));

  const net = overallNetByUser(owes, memberIds);
  const transfers = simplifyDebts(net);
  return transfers.map((t) => ({ ...t, fromName: nameById.get(t.fromUserId) ?? "Member", toName: nameById.get(t.toUserId) ?? "Member" }));
}

export async function getExpenseDetail(expenseId: string): Promise<SplitExpenseDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: expense } = await supabase.from("split_expenses").select("*").eq("id", expenseId).maybeSingle();
  if (!expense) return null;

  const [context, splitMembers, { data: participants }] = await Promise.all([
    getHouseholdContext(expense.household_id),
    getSplitGroupMembers(expense.group_id),
    supabase.from("split_expense_participants").select("*").eq("expense_id", expenseId),
  ]);
  if (!context) return null;

  const nameById = new Map(splitMembers.map((m) => [m.userId, m.name]));
  const isOwner = context.myRole === "owner";

  return {
    id: expense.id,
    groupId: expense.group_id,
    description: expense.description,
    amount: expense.amount,
    category: expense.category,
    paidBy: expense.paid_by,
    paidByName: nameById.get(expense.paid_by) ?? "Member",
    expenseDate: expense.expense_date,
    comment: expense.comment,
    receiptUrl: expense.receipt_url,
    splitMethod: expense.split_method,
    createdBy: expense.created_by,
    canEdit: isOwner || expense.created_by === user.id,
    participants: (participants ?? [])
      .map((p) => ({
        userId: p.user_id,
        name: nameById.get(p.user_id) ?? "Member",
        shareType: p.share_type,
        shareValue: p.share_value,
        owedAmount: p.owed_amount,
        isPayer: p.user_id === expense.paid_by,
      }))
      .sort((a, b) => (a.isPayer === b.isPayer ? 0 : a.isPayer ? -1 : 1)),
  };
}

function toRpcParticipants(split: ReturnType<typeof computeSplit>) {
  if ("error" in split) return split;
  return split.map((s) => ({ user_id: s.userId, share_type: s.shareType, share_value: s.shareValue, owed_amount: s.owedAmount }));
}

/**
 * input.paidBy is intentionally ignored here — the payer is always whoever
 * is authenticated and calling this action (see record_split_expense() in
 * supabase/schema.sql, which doesn't even accept a payer parameter anymore).
 * A manipulated client request has no field left to override this through.
 */
export async function createExpense(householdId: string, input: CreateExpenseInput): Promise<{ expenseId: string } | { error: string }> {
  if (!input.description.trim()) return { error: "Give the expense a description." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Amount must be greater than zero." };

  const split = computeSplit(input.amount, input.splitMethod, input.participants);
  const rpcParticipants = toRpcParticipants(split);
  if ("error" in rpcParticipants) return rpcParticipants;

  const groupId = await getDefaultGroupId(householdId);
  if (!groupId) return { error: "This household doesn't have a split group yet." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_split_expense", {
    p_group_id: groupId,
    p_description: input.description.trim(),
    p_amount: input.amount,
    p_category: input.category,
    p_expense_date: input.expenseDate ?? null,
    p_comment: input.comment?.trim() || null,
    p_split_method: input.splitMethod,
    p_participants: rpcParticipants,
  });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to record expense" };

  revalidatePath("/household");
  return { expenseId: data.expense_id };
}

export async function updateExpense(expenseId: string, input: CreateExpenseInput): Promise<{ ok: true } | { error: string }> {
  if (!input.description.trim()) return { error: "Give the expense a description." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Amount must be greater than zero." };

  const split = computeSplit(input.amount, input.splitMethod, input.participants);
  const rpcParticipants = toRpcParticipants(split);
  if ("error" in rpcParticipants) return rpcParticipants;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_split_expense", {
    p_expense_id: expenseId,
    p_description: input.description.trim(),
    p_amount: input.amount,
    p_category: input.category,
    p_paid_by: input.paidBy,
    p_expense_date: input.expenseDate ?? null,
    p_comment: input.comment?.trim() || null,
    p_split_method: input.splitMethod,
    p_participants: rpcParticipants,
  });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to update expense" };

  revalidatePath("/household");
  return { ok: true };
}

export async function deleteExpense(expenseId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_split_expense", { p_expense_id: expenseId });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to delete expense" };

  revalidatePath("/household");
  return { ok: true };
}

export async function recordSettlement(householdId: string, input: RecordSettlementInput): Promise<{ ok: true } | { error: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Amount must be greater than zero." };

  const groupId = await getDefaultGroupId(householdId);
  if (!groupId) return { error: "This household doesn't have a split group yet." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const fromUser = input.iPaid ? user.id : input.otherUserId;
  const toUser = input.iPaid ? input.otherUserId : user.id;

  const { data, error } = await supabase.rpc("record_split_settlement", {
    p_group_id: groupId,
    p_from_user: fromUser,
    p_to_user: toUser,
    p_amount: input.amount,
    p_method: input.method,
    p_comment: input.comment?.trim() || null,
  });
  if (error || !data?.ok) return { error: error?.message ?? "Failed to record settlement" };

  revalidatePath("/household");
  return { ok: true };
}
