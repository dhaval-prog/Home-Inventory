"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";
import { getSimplifiedBalances, type SplitMemberBalance, type SimplifiedTransferWithNames } from "@/lib/actions/split";
import { SettleUpDialog } from "@/components/household/split/settle-up-dialog";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function BalancesSheet({
  householdId,
  open,
  onOpenChange,
  memberBalances,
}: {
  householdId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memberBalances: SplitMemberBalance[];
}) {
  const [settleTarget, setSettleTarget] = useState<{ userId: string; name: string; iPaid: boolean; amount: number } | null>(null);
  const [simplified, setSimplified] = useState<SimplifiedTransferWithNames[] | null>(null);
  const [loadingSimplify, setLoadingSimplify] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Balances</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-4">
            <div className="space-y-2">
              {memberBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other members yet.</p>
              ) : (
                memberBalances.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2.5 rounded-xl border p-3 text-sm">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.name}</p>
                      <p className={`text-xs ${m.netAmount > 0.01 ? "text-emerald-600" : m.netAmount < -0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                        {Math.abs(m.netAmount) < 0.01
                          ? "Settled up"
                          : m.netAmount > 0
                            ? `Owes you ${inr(m.netAmount)}`
                            : `You owe ${inr(-m.netAmount)}`}
                      </p>
                    </div>
                    {Math.abs(m.netAmount) >= 0.01 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSettleTarget({ userId: m.userId, name: m.name, iPaid: m.netAmount < 0, amount: Math.abs(m.netAmount) })
                        }
                      >
                        Settle Up
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">✨ Simplify Balances</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loadingSimplify}
                  onClick={() => {
                    setLoadingSimplify(true);
                    getSimplifiedBalances(householdId).then((result) => {
                      setSimplified(result);
                      setLoadingSimplify(false);
                    });
                  }}
                >
                  {simplified ? "Refresh" : "Calculate"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Reduces everyone&apos;s IOUs to the fewest payments needed — nobody&apos;s final balance changes, only how you settle up.
              </p>
              {simplified &&
                (simplified.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Already as simple as it gets.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {simplified.map((t, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span>
                          {t.fromName} → {t.toName}
                        </span>
                        <span className="font-medium">{inr(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {settleTarget && (
        <SettleUpDialog
          householdId={householdId}
          open={!!settleTarget}
          onOpenChange={(v) => {
            if (!v) setSettleTarget(null);
          }}
          otherUserId={settleTarget.userId}
          otherName={settleTarget.name}
          iPaid={settleTarget.iPaid}
          suggestedAmount={settleTarget.amount}
        />
      )}
    </>
  );
}
