"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BalancesSheet } from "@/components/household/split/balances-sheet";
import { ExpenseDetailDialog } from "@/components/household/split/expense-detail-dialog";
import { SplitChatButton } from "@/components/household/split/split-chat-button";
import { MemberManagerDialog } from "@/components/household/member-manager-dialog";
import { listEligibleSplitGroupMembers, addSplitGroupMember, removeSplitGroupMember } from "@/lib/actions/split";
import type { SplitSummary } from "@/lib/actions/split";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** "You owe / You are owed / Net", recent expenses, and entry points into Balances (+ Simplify), Split Chat, Invite Members, and each expense's detail — deliberately plain language throughout, no ledger/accounting terms, per spec §3/§19. */
export function SplitDashboard({
  householdId,
  summary,
  members,
  currentUserId,
  isOwner,
}: {
  householdId: string;
  summary: SplitSummary;
  members: HouseholdMemberLite[];
  currentUserId: string;
  isOwner: boolean;
}) {
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Let's Split's own member list is who may manage it — the group's
  // creator or the household owner (mirrors can_manage_split_group() in
  // supabase/schema.sql), computed from the group-scoped `members` list
  // itself rather than a second server round-trip.
  const canManageMembers = isOwner || members.some((m) => m.userId === currentUserId && m.isCreator);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-destructive/10 p-3">
          <p className="text-xs text-muted-foreground">You owe</p>
          <p className="mt-0.5 text-lg font-semibold text-destructive">{inr(summary.youOwe)}</p>
        </div>
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <p className="text-xs text-muted-foreground">You are owed</p>
          <p className="mt-0.5 text-lg font-semibold text-emerald-600">{inr(summary.youAreOwed)}</p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <p className="text-xs text-muted-foreground">Net</p>
          <p className={`mt-0.5 text-lg font-semibold ${summary.net >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {summary.net >= 0 ? "+" : "-"}
            {inr(Math.abs(summary.net))}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => setBalancesOpen(true)}>
          Balances
        </Button>
        <SplitChatButton householdId={householdId} groupId={summary.groupId} currentUserId={currentUserId} members={members} />
      </div>

      {canManageMembers && (
        <MemberManagerDialog
          title="Let's Split members"
          members={members.map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, isCreator: m.isCreator ?? false }))}
          fetchEligible={() => listEligibleSplitGroupMembers(summary.groupId, householdId)}
          onAdd={(userId) => addSplitGroupMember(summary.groupId, userId)}
          onRemove={(userId) => removeSplitGroupMember(summary.groupId, userId)}
        />
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Recent Expenses</p>
        {summary.recentExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses yet — add one to start splitting.</p>
        ) : (
          <ul className="space-y-2">
            {summary.recentExpenses.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setDetailId(e.id)}
                  className="w-full rounded-xl border bg-card p-3 text-left transition hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{e.description}</span>
                    <span className="font-medium">{inr(e.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {e.payerName} paid · {e.participantCount} {e.participantCount === 1 ? "person" : "people"}
                    </span>
                    <span className={e.settled ? "text-emerald-600" : ""}>{e.settled ? "Settled" : "Pending"}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BalancesSheet householdId={householdId} open={balancesOpen} onOpenChange={setBalancesOpen} memberBalances={summary.memberBalances} />

      {detailId && (
        <ExpenseDetailDialog
          expenseId={detailId}
          open={!!detailId}
          onOpenChange={(v) => {
            if (!v) setDetailId(null);
          }}
          members={members}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
