"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

export interface ManagedMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isCreator: boolean;
}

/**
 * Shared "Invite Members" UI for New Goal and Let's Split — deliberately a
 * member *picker* over the existing household roster, not a token/invite
 * flow: the person is already a household member, this just grants them
 * SPLIT_ACCESS/goal-equivalent visibility into one specific goal or split
 * group, nothing else. The real gate is always the server action passed in
 * (add_goal_member/add_split_group_member RPCs, owner-or-creator-only) — this
 * component only ever hides itself for a non-manager, per the caller's own
 * "Invite Members" trigger conditional.
 */
export function MemberManagerDialog({
  title,
  members,
  fetchEligible,
  onAdd,
  onRemove,
}: {
  title: string;
  members: ManagedMember[];
  fetchEligible: () => Promise<ManagedMember[]>;
  onAdd: (userId: string) => Promise<{ ok: true } | { error: string }>;
  onRemove: (userId: string) => Promise<{ ok: true } | { error: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [eligible, setEligible] = useState<ManagedMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEligible(null);
    fetchEligible().then(setEligible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <UserPlus className="size-4" />
            Invite Members
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Members</p>
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm">
                  <Avatar size="sm">
                    <AvatarFallback>{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">
                    {m.name}
                    {m.isCreator && <span className="ml-1.5 text-xs text-muted-foreground">(creator)</span>}
                  </span>
                  {!m.isCreator && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await onRemove(m.userId);
                          if ("error" in result) {
                            setError(result.error);
                            return;
                          }
                          setError(null);
                          router.refresh();
                        })
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Add from household</p>
            {eligible === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : eligible.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone in the household is already a member.</p>
            ) : (
              <ul className="space-y-1.5">
                {eligible.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await onAdd(m.userId);
                          if ("error" in result) {
                            setError(result.error);
                            return;
                          }
                          setError(null);
                          setEligible((prev) => prev?.filter((e) => e.userId !== m.userId) ?? null);
                          router.refresh();
                        })
                      }
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
