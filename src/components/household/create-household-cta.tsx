"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createHousehold } from "@/lib/actions/household";

/** The empty-state entry point for a user with no households yet — a standalone trigger + dialog, separate from HouseholdSwitcher's dropdown-driven one. */
export function CreateHouseholdCta() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg">
            <Plus className="size-4" />
            Create your household
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a household</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="first-household-name">Household name</Label>
          <Input id="first-household-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Our Home" autoFocus />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await createHousehold(name.trim());
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.push(`/household?id=${result.householdId}`);
              })
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
