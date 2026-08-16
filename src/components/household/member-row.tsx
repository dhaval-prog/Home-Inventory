"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initials } from "@/lib/utils";
import { removeMember, promoteToCoOwner } from "@/lib/actions/household";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/**
 * `canPromote` is only ever true for the caller when they're the household
 * owner looking at a `member`-role row — but the real gate is the
 * household_members_update_owner RLS policy (owner-only), so this button is
 * just a shortcut into promoteToCoOwner(), never the actual permission check.
 */
export function MemberRow({
  householdId,
  userId,
  name,
  role,
  totalContributed,
  canRemove,
  canPromote,
}: {
  householdId: string;
  userId: string;
  name: string;
  role: string;
  totalContributed: number;
  canRemove: boolean;
  canPromote: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [manageOpen, setManageOpen] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoting, startPromoteTransition] = useTransition();

  const identity = (
    <>
      <Avatar size="sm">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs text-muted-foreground capitalize">{role.replace("_", " ")}</p>
      </div>
    </>
  );

  return (
    <li className="flex items-center gap-2.5 text-sm">
      {canPromote ? (
        <button
          type="button"
          onClick={() => {
            setPromoteError(null);
            setManageOpen(true);
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left transition hover:bg-muted/60"
        >
          {identity}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{identity}</div>
      )}
      <span className="text-xs text-muted-foreground">Shared: </span>
      <span className="font-medium">{inr(totalContributed)}</span>
      {canRemove && (
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await removeMember(householdId, userId);
              router.refresh();
            })
          }
        >
          <X className="size-3.5" />
        </Button>
      )}

      {canPromote && (
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage {name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Make <span className="font-medium text-foreground">{name}</span> a Co-Owner? They&apos;ll immediately be able to invite new
              members and take on the same household-management actions as you, short of promoting others.
            </p>
            {promoteError && <p className="text-sm text-destructive">{promoteError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setManageOpen(false)} disabled={promoting}>
                Cancel
              </Button>
              <Button
                disabled={promoting}
                onClick={() =>
                  startPromoteTransition(async () => {
                    const result = await promoteToCoOwner(householdId, userId);
                    if ("error" in result) {
                      setPromoteError(result.error);
                      return;
                    }
                    setManageOpen(false);
                    router.refresh();
                  })
                }
              >
                Make Co-Owner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}
