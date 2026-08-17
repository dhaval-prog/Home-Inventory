"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GoalCard } from "@/components/household/goal-card";
import { CreateGoalDialog } from "@/components/household/create-goal-dialog";
import { SplitDashboard } from "@/components/household/split/split-dashboard";
import { AddExpenseDialog } from "@/components/household/split/add-expense-dialog";
import { useFinanceTab } from "@/components/household/finance-tab-context";
import type { HouseholdGoalSummary } from "@/lib/actions/household-goals";
import type { SplitSummary } from "@/lib/actions/split";

export interface HouseholdMemberLite {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Present when sourced from a group/goal's own membership list (getSplitGroupMembers/listGoalMembers) — absent for the plain household roster. */
  isCreator?: boolean;
}

/**
 * The "Shared Savings" card's content for whichever tab is active — New Goal
 * (collaborative savings — the pre-existing Savings Goals feature, untouched)
 * or Let's Split (shared expenses). The tab selection itself now lives in the
 * Home header (see FinanceToggle below + finance-tab-context), so this card
 * only reads it, never renders its own copy — one card, one shared toggle,
 * deliberately not two separate features glued together, per spec:
 * "do not merge savings and shared expenses into one balance."
 */
export function HouseholdFinanceCard({
  householdId,
  activeGoals,
  isOwner,
  myUserId,
  splitSummary,
  members,
}: {
  householdId: string;
  activeGoals: HouseholdGoalSummary[];
  isOwner: boolean;
  myUserId: string;
  splitSummary: SplitSummary | null;
  members: HouseholdMemberLite[];
}) {
  const { tab } = useFinanceTab();

  return (
    <Card className="p-5">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 p-0">
        <h3 className="text-[17px] font-semibold tracking-tight">
          {tab === "goal" ? "🎯 Goals" : "🤝 Let's Split"}
        </h3>
        {tab === "goal" ? (
          <CreateGoalDialog householdId={householdId} />
        ) : (
          <AddExpenseDialog
            householdId={householdId}
            members={members}
            currentUserId={myUserId}
          />
        )}
      </CardHeader>

      <div className="mt-4">
        {tab === "goal" ? (
          <div className="space-y-3">
            {activeGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No goals yet — create one to start saving toward something
                together.
              </p>
            ) : (
              activeGoals.map((g) => (
                <GoalCard
                  key={g.goal.id}
                  summary={g}
                  canDelete={isOwner || g.goal.created_by === myUserId}
                  currentUserId={myUserId}
                />
              ))
            )}
          </div>
        ) : splitSummary ? (
          <SplitDashboard
            householdId={householdId}
            summary={splitSummary}
            members={members}
            currentUserId={myUserId}
            isOwner={isOwner}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t been added to this household&apos;s split group yet — ask an owner to invite you from inside Let&apos;s Split.
          </p>
        )}
      </div>
    </Card>
  );
}

/** The segmented New Goal / Let's Split toggle — lives in the Home header beside Invite, not inside the finance card. Same design/animation as before, just relocated and now driven by shared context instead of local state. */
export function FinanceToggle() {
  const { tab, setTab } = useFinanceTab();

  return (
    <div className="relative inline-flex items-center rounded-full bg-muted p-1">
      <div
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm ring-1 ring-foreground/10 transition-transform duration-300 ease-out"
        style={{
          transform: tab === "split" ? "translateX(100%)" : "translateX(0)",
        }}
      />
      <button
        type="button"
        onClick={() => setTab("goal")}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
          tab === "goal" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        🎯 New Goal
      </button>
      <button
        type="button"
        onClick={() => setTab("split")}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
          tab === "split" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        🤝 Let&apos;s Split
      </button>
    </div>
  );
}
