"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GoalCard } from "@/components/household/goal-card";
import { CreateGoalDialog } from "@/components/household/create-goal-dialog";
import { SplitDashboard } from "@/components/household/split/split-dashboard";
import { AddExpenseDialog } from "@/components/household/split/add-expense-dialog";
import type { HouseholdGoalSummary } from "@/lib/actions/household-goals";
import type { SplitSummary } from "@/lib/actions/split";

type FinanceTab = "goal" | "split";

export interface HouseholdMemberLite {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The "Shared Savings" card's own segmented toggle between New Goal
 * (collaborative savings — the pre-existing Savings Goals feature, untouched)
 * and Let's Split (shared expenses). One card, one toggle — deliberately not
 * two separate features glued together, per spec §1/§20: "do not merge
 * savings and shared expenses into one balance."
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
  const [tab, setTab] = useState<FinanceTab>("goal");

  return (
    <Card className="p-5">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 p-0">
        <FinanceToggle value={tab} onChange={setTab} />
        {tab === "goal" ? <CreateGoalDialog householdId={householdId} /> : <AddExpenseDialog householdId={householdId} members={members} />}
      </CardHeader>

      <div className="mt-4">
        {tab === "goal" ? (
          <div className="space-y-3">
            {activeGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No goals yet — create one to start saving toward something together.</p>
            ) : (
              activeGoals.map((g) => <GoalCard key={g.goal.id} summary={g} canDelete={isOwner || g.goal.created_by === myUserId} />)
            )}
          </div>
        ) : splitSummary ? (
          <SplitDashboard householdId={householdId} summary={splitSummary} members={members} />
        ) : (
          <p className="text-sm text-muted-foreground">Let&apos;s Split isn&apos;t set up for this household yet.</p>
        )}
      </div>
    </Card>
  );
}

function FinanceToggle({ value, onChange }: { value: FinanceTab; onChange: (v: FinanceTab) => void }) {
  return (
    <div className="relative inline-flex items-center rounded-full bg-muted p-1">
      <div
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm ring-1 ring-foreground/10 transition-transform duration-300 ease-out"
        style={{ transform: value === "split" ? "translateX(100%)" : "translateX(0)" }}
      />
      <button
        type="button"
        onClick={() => onChange("goal")}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
          value === "goal" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        🎯 New Goal
      </button>
      <button
        type="button"
        onClick={() => onChange("split")}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
          value === "split" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        🤝 Let&apos;s Split
      </button>
    </div>
  );
}
