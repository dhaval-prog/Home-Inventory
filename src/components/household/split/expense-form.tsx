"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";
import { computeSplit } from "@/lib/split/split-math";
import { VAULT_CATEGORIES } from "@/lib/voice/types";
import type { SplitShareType } from "@/lib/supabase/types";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";
import type { CreateExpenseInput } from "@/lib/actions/split";

const SPLIT_METHODS: { value: SplitShareType; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "exact", label: "Exact Amount" },
  { value: "percentage", label: "Percentage" },
  { value: "shares", label: "Shares" },
];

const VALUE_PLACEHOLDER: Record<SplitShareType, string> = {
  equal: "",
  exact: "₹",
  percentage: "%",
  shares: "shares",
};

export interface ExpenseFormValue {
  description: string;
  amount: string;
  category: string | null;
  paidBy: string;
  comment: string;
  splitMethod: SplitShareType;
  participantIds: string[];
  values: Record<string, string>;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * The one expense form, shared by AddExpenseDialog (create) and
 * ExpenseDetailDialog's edit mode (update) — same fields, same live split
 * preview/validation either way, so the two flows can never drift apart.
 *
 * `mode: "create"` hides the Paid By selector entirely — whoever opens Add
 * Expense is understood to be the payer, so `paidBy` is locked to
 * `currentUserId` without asking. The backend enforces this too (see
 * createExpense() in src/lib/actions/split.ts): even a manipulated request
 * can't override the payer on create. `mode: "edit"` keeps the existing
 * Paid By selector unchanged — reassigning who paid is a separate,
 * already owner/creator-gated flow.
 */
export function ExpenseForm({
  members,
  mode,
  currentUserId,
  initialValue,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  members: HouseholdMemberLite[];
  mode: "create" | "edit";
  currentUserId: string;
  initialValue?: Partial<ExpenseFormValue>;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: CreateExpenseInput) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(initialValue?.description ?? "");
  const [amount, setAmount] = useState(initialValue?.amount ?? "");
  const [category, setCategory] = useState<string | null>(initialValue?.category ?? null);
  const [paidBy, setPaidBy] = useState(mode === "create" ? currentUserId : (initialValue?.paidBy ?? members[0]?.userId ?? ""));
  const [comment, setComment] = useState(initialValue?.comment ?? "");
  const [splitMethod, setSplitMethod] = useState<SplitShareType>(initialValue?.splitMethod ?? "equal");
  const [participantIds, setParticipantIds] = useState<string[]>(initialValue?.participantIds ?? members.map((m) => m.userId));
  const [values, setValues] = useState<Record<string, string>>(initialValue?.values ?? {});
  const [localError, setLocalError] = useState<string | null>(null);

  const numericAmount = Number(amount);

  function toggleParticipant(userId: string) {
    setParticipantIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  const preview = useMemo(() => {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || participantIds.length === 0) return null;
    const inputs = participantIds.map((userId) => ({
      userId,
      value: splitMethod === "equal" ? undefined : Number(values[userId] ?? 0),
    }));
    return computeSplit(numericAmount, splitMethod, inputs);
  }, [numericAmount, splitMethod, participantIds, values]);

  function handleSubmit() {
    setLocalError(null);
    if (!description.trim()) return setLocalError("Give the expense a description.");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setLocalError("Amount must be greater than zero.");
    if (!paidBy) return setLocalError("Choose who paid.");
    if (participantIds.length === 0) return setLocalError("Pick at least one participant.");
    if (preview && "error" in preview) return setLocalError(preview.error);

    onSubmit({
      description: description.trim(),
      amount: numericAmount,
      category,
      paidBy,
      comment: comment.trim() || null,
      splitMethod,
      participants: participantIds.map((userId) => ({
        userId,
        value: splitMethod === "equal" ? undefined : Number(values[userId] ?? 0),
      })),
    });
  }

  const displayError = localError ?? error;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="expense-description">Description</Label>
        <Input id="expense-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dinner" autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="expense-amount">Amount (₹)</Label>
        <Input
          id="expense-amount"
          type="number"
          min={0.01}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="2400"
        />
      </div>

      <div className="space-y-2">
        <Label>Category (optional)</Label>
        <div className="flex flex-wrap gap-1.5">
          {VAULT_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory((current) => (current === c ? null : c))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${category === c ? "border-primary bg-primary/10" : "text-muted-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="space-y-2">
          <Label>Paid by</Label>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => setPaidBy(m.userId)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium ${paidBy === m.userId ? "border-primary bg-primary/10" : ""}`}
              >
                <Avatar size="sm">
                  <AvatarFallback>{initials(m.name)}</AvatarFallback>
                </Avatar>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Avatar size="sm">
            <AvatarFallback>{initials(members.find((m) => m.userId === currentUserId)?.name ?? "You")}</AvatarFallback>
          </Avatar>
          Paid by <span className="font-medium text-foreground">You</span>
        </div>
      )}

      <div className="space-y-2">
        <Label>Split method</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {SPLIT_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setSplitMethod(m.value)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium ${splitMethod === m.value ? "border-primary bg-primary/10" : ""}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Participants</Label>
        <div className="space-y-1 rounded-lg border p-1.5">
          {members.map((m) => {
            const checked = participantIds.includes(m.userId);
            return (
              <label key={m.userId} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted/50">
                <Checkbox checked={checked} onCheckedChange={() => toggleParticipant(m.userId)} />
                <Avatar size="sm">
                  <AvatarFallback>{initials(m.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {splitMethod !== "equal" && checked && (
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={values[m.userId] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [m.userId]: e.target.value }))}
                    className="h-7 w-20 text-xs"
                    placeholder={VALUE_PLACEHOLDER[splitMethod]}
                  />
                )}
              </label>
            );
          })}
        </div>
      </div>

      {preview && !("error" in preview) && (
        <div className="space-y-1 rounded-lg bg-muted/40 p-2.5 text-xs">
          {preview.map((p) => (
            <div key={p.userId} className="flex items-center justify-between">
              <span>{members.find((m) => m.userId === p.userId)?.name}</span>
              <span className="font-medium">{inr(p.owedAmount)}</span>
            </div>
          ))}
        </div>
      )}
      {preview && "error" in preview && <p className="text-xs text-destructive">{preview.error}</p>}

      <div className="space-y-2">
        <Label htmlFor="expense-comment">Comment (optional)</Label>
        <Textarea id="expense-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
      </div>

      {displayError && <p className="text-sm text-destructive">{displayError}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
