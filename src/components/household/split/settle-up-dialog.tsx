"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordSettlement } from "@/lib/actions/split";
import type { SplitSettlementMethod } from "@/lib/supabase/types";

const METHODS: { value: SplitSettlementMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

/**
 * Records that money already changed hands outside the app (spec §9) —
 * never a payment integration. `iPaid` fixes the direction; the amount
 * field is always editable so a partial settlement ("pays ₹1,000 of the
 * ₹2,000 owed") is just typing a smaller number, and "Settle All" is just
 * leaving the suggested full amount as-is.
 */
export function SettleUpDialog({
  householdId,
  open,
  onOpenChange,
  otherUserId,
  otherName,
  iPaid,
  suggestedAmount,
}: {
  householdId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  otherUserId: string;
  otherName: string;
  iPaid: boolean;
  suggestedAmount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(suggestedAmount.toFixed(2));
  const [method, setMethod] = useState<SplitSettlementMethod>("cash");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsedAmount = Number(amount);
  const canSubmit = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{iPaid ? `Record a payment to ${otherName}` : `Record a payment from ${otherName}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settle-amount">Amount (₹)</Label>
            <Input id="settle-amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${method === m.value ? "border-primary bg-primary/10" : ""}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settle-comment">Note (optional)</Label>
            <Input id="settle-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Paid via Google Pay" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || !canSubmit}
            onClick={() =>
              startTransition(async () => {
                const result = await recordSettlement(householdId, { otherUserId, amount: parsedAmount, method, comment, iPaid });
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                onOpenChange(false);
                router.refresh();
              })
            }
          >
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
