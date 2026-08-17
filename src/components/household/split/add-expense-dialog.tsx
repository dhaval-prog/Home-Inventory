"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ExpenseForm,
  type ExpenseFormValue,
} from "@/components/household/split/expense-form";
import { createExpense, type CreateExpenseInput } from "@/lib/actions/split";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";

/**
 * Also usable in "controlled" mode (open/onOpenChange supplied, no visible
 * trigger rendered) so Split Chat's "Review & Add" chip can launch the same
 * form pre-filled from a detected expense, instead of building a second,
 * parallel create-expense UI.
 */
export function AddExpenseDialog({
  householdId,
  members,
  currentUserId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  prefill,
  onCreated,
}: {
  householdId: string;
  members: HouseholdMemberLite[];
  currentUserId: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  prefill?: Partial<ExpenseFormValue>;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) controlledOnOpenChange?.(v);
    else setUncontrolledOpen(v);
  };
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trigger: ReactNode = !isControlled && (
    <DialogTrigger
      render={
        <Button size="sm">
          <Plus className="size-4" />
          Add Expense
        </Button>
      }
    />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      {trigger}
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add an expense</DialogTitle>
        </DialogHeader>
        <ExpenseForm
          mode="create"
          currentUserId={currentUserId}
          members={members}
          initialValue={prefill}
          submitLabel="Add Expense"
          pending={pending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={(input: CreateExpenseInput) =>
            startTransition(async () => {
              const result = await createExpense(householdId, input);
              if ("error" in result) {
                setError(result.error);
                return;
              }
              setError(null);
              setOpen(false);
              onCreated?.();
              router.refresh();
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
