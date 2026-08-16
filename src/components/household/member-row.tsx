"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";
import { removeMember } from "@/lib/actions/household";

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function MemberRow({
  householdId,
  userId,
  name,
  role,
  totalContributed,
  canRemove,
}: {
  householdId: string;
  userId: string;
  name: string;
  role: string;
  totalContributed: number;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex items-center gap-2.5 text-sm">
      <Avatar size="sm">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs text-muted-foreground capitalize">{role.replace("_", " ")}</p>
      </div>
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
    </li>
  );
}
