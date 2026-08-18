"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createHousehold, joinHousehold } from "@/lib/actions/household";
import type { HouseholdListEntry } from "@/lib/actions/household";

export function HouseholdSwitcher({ households, currentId }: { households: HouseholdListEntry[]; currentId: string }) {
  const router = useRouter();
  const current = households.find((h) => h.household.id === currentId);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="gap-1.5 rounded-full bg-white">
              🏠 {current?.household.name ?? "Our Home"}
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-64">
          {/* Menu.GroupLabel (DropdownMenuLabel) requires a Menu.Group ancestor to register its
              label id — used bare, Base UI throws error #31 the instant the menu opens. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Your households</DropdownMenuLabel>
            {households.map((h) => (
              <DropdownMenuItem
                key={h.household.id}
                className={h.household.id === currentId ? "bg-accent" : undefined}
                render={
                  <Link href={`/household?id=${h.household.id}`}>
                    🏠 {h.household.name}
                    <span className="ml-auto text-xs text-muted-foreground capitalize">{h.role}</span>
                  </Link>
                }
              />
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create Your Own
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setJoinOpen(true)}>
            <Users className="size-4" />
            Join with a code
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateHouseholdDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => router.push(`/household?id=${id}`)} />
      <JoinHouseholdDialog open={joinOpen} onOpenChange={setJoinOpen} onJoined={(id) => router.push(`/household?id=${id}`)} />
    </>
  );
}

function CreateHouseholdDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (householdId: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a household</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="household-name">Household name</Label>
          <Input id="household-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Our Home" autoFocus />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
                setName("");
                setError(null);
                onOpenChange(false);
                onCreated(result.householdId);
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

function JoinHouseholdDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (householdId: string) => void;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a household</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="invite-token">Invite code</Label>
          <Input
            id="invite-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the code someone shared with you"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
                setToken("");
                setError(null);
                onOpenChange(false);
                onJoined(result.householdId);
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
