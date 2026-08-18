"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { ExpenseForm } from "@/components/household/split/expense-form";
import { getExpenseDetail, updateExpense, deleteExpense, type SplitExpenseDetail, type CreateExpenseInput } from "@/lib/actions/split";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function ExpenseDetailDialog({
  expenseId,
  open,
  onOpenChange,
  members,
  currentUserId,
}: {
  expenseId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  members: HouseholdMemberLite[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<SplitExpenseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode("view");
    setConfirmDelete(false);
    setError(null);
    setLoading(true);
    getExpenseDetail(expenseId).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [open, expenseId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit expense" : (detail?.description ?? "Expense")}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">This expense couldn&apos;t be found.</p>
        ) : mode === "edit" ? (
          <ExpenseForm
            mode="edit"
            currentUserId={currentUserId}
            members={members}
            initialValue={{
              description: detail.description,
              amount: String(detail.amount),
              category: detail.category,
              paidBy: detail.paidBy,
              comment: detail.comment ?? "",
              splitMethod: detail.splitMethod,
              participantIds: detail.participants.map((p) => p.userId),
              values: Object.fromEntries(detail.participants.map((p) => [p.userId, p.shareValue != null ? String(p.shareValue) : ""])),
            }}
            submitLabel="Save Changes"
            pending={pending}
            error={error}
            onCancel={() => setMode("view")}
            onSubmit={(input: CreateExpenseInput) =>
              startTransition(async () => {
                const result = await updateExpense(expenseId, input);
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                setError(null);
                const refreshed = await getExpenseDetail(expenseId);
                setDetail(refreshed);
                setMode("view");
                router.refresh();
              })
            }
          />
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-2xl font-semibold">{inr(detail.amount)}</p>
              <p className="text-sm text-muted-foreground">
                Paid by {detail.paidByName} · {new Date(detail.expenseDate).toLocaleDateString("en-IN")}
                {detail.category ? ` · ${detail.category}` : ""}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Split</p>
              <ul className="space-y-2">
                {detail.participants.map((p) => (
                  <li key={p.userId} className="flex items-center gap-2.5 text-sm">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      {p.isPayer && <span className="ml-1.5 text-xs text-muted-foreground">(paid)</span>}
                    </span>
                    <span className="font-medium">{inr(p.owedAmount)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {detail.comment && (
              <div>
                <p className="text-sm font-medium">Comment</p>
                <p className="text-sm text-muted-foreground">{detail.comment}</p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {confirmDelete ? (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm">Delete &ldquo;{detail.description}&rdquo;? This removes it and its split for everyone.</p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteExpense(expenseId);
                        if ("error" in result) {
                          setError(result.error);
                          return;
                        }
                        onOpenChange(false);
                        router.refresh();
                      })
                    }
                  >
                    Delete Expense
                  </Button>
                </div>
              </div>
            ) : (
              detail.canEdit && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                  <Button onClick={() => setMode("edit")}>
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                </DialogFooter>
              )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
