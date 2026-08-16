"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGoal } from "@/lib/actions/household-goals";

const GOAL_ICON_PRESETS = ["🎯", "✈️", "🏠", "📺", "🧊", "🎓", "🚗", "💍"];

export function CreateGoalDialog({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(GOAL_ICON_PRESETS[0]);
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amount = Number(targetAmount);
  const canSubmit = name.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            New Goal
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a savings goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {GOAL_ICON_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={`flex size-9 items-center justify-center rounded-full border text-lg ${icon === emoji ? "border-primary bg-primary/10" : "border-transparent bg-muted"}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-name">Goal name</Label>
            <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family Vacation" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-target">Target amount (₹)</Label>
            <Input
              id="goal-target"
              type="number"
              min={1}
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="60000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-deadline">Deadline (optional)</Label>
            <Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !canSubmit}
            onClick={() =>
              startTransition(async () => {
                const result = await createGoal(householdId, {
                  name: name.trim(),
                  icon,
                  targetAmount: amount,
                  deadline: deadline || null,
                });
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                setName("");
                setTargetAmount("");
                setDeadline("");
                setError(null);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Create Goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
