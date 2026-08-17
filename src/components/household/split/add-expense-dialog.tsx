"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExpenseForm } from "@/components/household/split/expense-form";
import { createExpense, type CreateExpenseInput } from "@/lib/actions/split";
import type { HouseholdMemberLite } from "@/components/household/finance-toggle";

export function AddExpenseDialog({ householdId, members }: { householdId: string; members: HouseholdMemberLite[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            Add Expense
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add an expense</DialogTitle>
        </DialogHeader>
        <ExpenseForm
          members={members}
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
              router.refresh();
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
