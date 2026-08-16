"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinHousehold } from "@/lib/actions/household";

export function JoinHouseholdCta() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" variant="outline">
            <Users className="size-4" />
            Join with a code
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a household</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="first-invite-token">Invite code</Label>
          <Input
            id="first-invite-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the code someone shared with you"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !token.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await joinHousehold(token.trim());
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.push(`/household?id=${result.householdId}`);
              })
            }
          >
            Join
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
