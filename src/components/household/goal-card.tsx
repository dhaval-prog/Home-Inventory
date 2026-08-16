"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import {
  getGoalDetail,
  contributeToGoal,
  type HouseholdGoalSummary,
  type HouseholdGoalDetail,
} from "@/lib/actions/household-goals";
import type { HouseholdVaultTransactionSource } from "@/lib/supabase/types";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** A goal's progress card — clicking it opens a sheet with the full contributor breakdown and a Contribute form, mirroring spec §8/§9 exactly (amount + source, then per-contributor amount + percentage). */
export function GoalCard({ summary }: { summary: HouseholdGoalSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<HouseholdGoalDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<HouseholdVaultTransactionSource>("personal_vault");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { goal, currentAmount, progressPct } = summary;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getGoalDetail(goal.id).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [open, goal.id]);

  const contributeAmount = Number(amount);
  const canContribute = Number.isFinite(contributeAmount) && contributeAmount > 0;

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full rounded-2xl border bg-card p-4 text-left transition hover:shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium">
            <span className="text-xl">{goal.icon}</span>
            {goal.name}
          </span>
          <span className="text-xs text-muted-foreground">{progressPct}%</span>
        </div>
        <Progress value={progressPct} max={100} className="mt-3" />
        <p className="mt-2 text-xs text-muted-foreground">
          {inr(currentAmount)} of {inr(goal.target_amount)}
        </p>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {goal.icon} {goal.name}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-4">
            <div>
              <p className="text-2xl font-semibold">{inr(currentAmount)}</p>
              <p className="text-sm text-muted-foreground">
                of {inr(goal.target_amount)} goal — {progressPct}% complete
              </p>
              <Progress value={progressPct} max={100} className="mt-2" />
            </div>

            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-sm font-medium">Contribute</p>
              <div className="space-y-2">
                <Label htmlFor="contribute-amount">Amount (₹)</Label>
                <Input
                  id="contribute-amount"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="2000"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSource("personal_vault")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${source === "personal_vault" ? "border-primary bg-primary/10" : ""}`}
                >
                  My Personal Vault
                </button>
                <button
                  type="button"
                  onClick={() => setSource("external")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${source === "external" ? "border-primary bg-primary/10" : ""}`}
                >
                  External / Manual
                </button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                disabled={pending || !canContribute}
                onClick={() =>
                  startTransition(async () => {
                    const result = await contributeToGoal(goal.id, contributeAmount, source);
                    if ("error" in result) {
                      setError(result.error);
                      return;
                    }
                    setAmount("");
                    setError(null);
                    const refreshed = await getGoalDetail(goal.id);
                    setDetail(refreshed);
                    router.refresh();
                  })
                }
              >
                Contribute {amount ? inr(contributeAmount) : ""}
              </Button>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Contributors</p>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : detail && detail.contributors.length > 0 ? (
                <ul className="space-y-2">
                  {detail.contributors.map((c) => (
                    <li key={c.userId} className="flex items-center gap-2.5 text-sm">
                      <Avatar size="sm">
                        <AvatarFallback>{initials(c.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.contributionCount} contribution{c.contributionCount === 1 ? "" : "s"}
                      </span>
                      <span className="font-medium">{inr(c.amount)}</span>
                      <span className="w-10 text-right text-xs text-muted-foreground">{c.percentage}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No contributions yet.</p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
