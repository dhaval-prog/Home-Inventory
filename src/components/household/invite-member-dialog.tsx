"use client";

import { useState, useTransition } from "react";
import { UserPlus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateInvite } from "@/lib/actions/household";
import type { HouseholdRole } from "@/lib/supabase/types";

const ROLE_OPTIONS: { value: Exclude<HouseholdRole, "owner">; label: string; description: string }[] = [
  { value: "member", label: "Member", description: "Can contribute, create goals, and use the household chat." },
  { value: "viewer", label: "Viewer", description: "Can see shared savings and goals, but can't change anything." },
  { value: "limited_member", label: "Limited Member", description: "For kids or restricted access — personal vault + limited visibility." },
];

export function InviteMemberDialog({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Exclude<HouseholdRole, "owner">>("member");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setToken(null);
    setCopied(false);
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <UserPlus className="size-4" />
            Invite
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
        </DialogHeader>

        {token ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share this code — whoever enters it joins as <span className="font-medium capitalize">{role.replace("_", " ")}</span>. It
              expires in 7 days.
            </p>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{token}</code>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Exclude<HouseholdRole, "owner">)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: Exclude<HouseholdRole, "owner">) => ROLE_OPTIONS.find((r) => r.value === v)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_OPTIONS.find((r) => r.value === role)?.description}</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {token ? "Done" : "Cancel"}
          </Button>
          {!token && (
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await generateInvite(householdId, role);
                  if ("error" in result) {
                    setError(result.error);
                    return;
                  }
                  setToken(result.token);
                })
              }
            >
              Generate Code
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
