"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Check, Link2, Mail, MessageCircle, Smartphone, UserPlus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSplitGroupInvite,
  getActiveSplitGroupInvite,
  sendSplitInviteSmsAction,
  type SplitGroupInvite,
} from "@/lib/actions/split-invites";

function whatsappUrl(phone: string, message: string): string {
  const digits = phone ? phone.replace(/\D/g, "") : "";
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Let's Split's own "Invite" entry point — scoped to exactly one split
 * group. The link is the primary mechanism (spec §2/§3); SMS, WhatsApp, and
 * Email are just delivery channels around that same token, never separate
 * invitations. `canInvite` mirrors InviteMemberDialog's own pattern: it's
 * computed server-side from can_manage_split_group and only ever hides the
 * trigger — the real gate is the split_group_invites RLS policies (see
 * supabase/schema.sql), so a non-manager can't mint an invite by calling the
 * action directly either.
 */
export function SplitInviteDialog({ groupId, groupName, canInvite }: { groupId: string; groupName: string; canInvite: boolean }) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<SplitGroupInvite | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || invite || loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    (async () => {
      const existing = await getActiveSplitGroupInvite(groupId);
      if (existing) {
        setInvite(existing);
        setPhone(existing.phoneNumber?.replace(/^\+91/, "") ?? "");
        setEmail(existing.email ?? "");
        setLoading(false);
        return;
      }
      const created = await createSplitGroupInvite(groupId);
      setLoading(false);
      if ("error" in created) {
        setError(created.error);
        return;
      }
      setInvite(created);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setInvite(null);
    setPhone("");
    setEmail("");
    setError(null);
    setLinkCopied(false);
    setSmsSending(false);
  }

  const shareMessage = invite
    ? `You've been invited to join my Let's Split group "${groupName}" on Home Inventory. Join here: ${invite.inviteUrl}`
    : "";

  function refreshInviteWithContact() {
    startTransition(async () => {
      setError(null);
      const result = await createSplitGroupInvite(groupId, { phone: phone.trim() || undefined, email: email.trim() || undefined });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInvite(result);
    });
  }

  if (!canInvite) {
    return (
      <Button
        size="sm"
        variant="outline"
        aria-disabled="true"
        title="Only this group's creator or the household owner can invite members."
        className="cursor-not-allowed text-muted-foreground/70 opacity-60 hover:bg-background hover:text-muted-foreground/70"
      >
        <Lock className="size-3.5" />
        Invite
      </Button>
    );
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite to {groupName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="split-invite-phone">Mobile number</Label>
            <div className="flex items-center gap-2">
              <span className="flex h-8 shrink-0 items-center rounded-lg border bg-muted/40 px-2.5 text-sm text-muted-foreground">+91</span>
              <Input
                id="split-invite-phone"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onBlur={() => invite && (phone.trim() || email.trim()) && refreshInviteWithContact()}
                placeholder="98765 43210"
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">Optional — you can also just copy and share the link below.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="split-invite-email">Email (optional)</Label>
            <Input
              id="split-invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => invite && (phone.trim() || email.trim()) && refreshInviteWithContact()}
              placeholder="name@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={!invite || smsSending}
              onClick={() => {
                if (!invite) return;
                if (!/^[6-9]\d{9}$/.test(phone.trim())) {
                  toast.error("Enter a valid 10-digit mobile number to send an SMS.");
                  return;
                }
                setSmsSending(true);
                startTransition(async () => {
                  const result = await sendSplitInviteSmsAction(phone.trim(), invite.inviteUrl, groupName);
                  setSmsSending(false);
                  if ("error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  toast(result.message);
                });
              }}
            >
              <Smartphone className="size-4" />
              {smsSending ? "Sending…" : "Send SMS"}
            </Button>

            <Button
              variant="outline"
              disabled={!invite}
              onClick={() => {
                if (!invite) return;
                navigator.clipboard.writeText(invite.inviteUrl);
                setLinkCopied(true);
                toast("Invite link copied!");
                setTimeout(() => setLinkCopied(false), 2000);
              }}
            >
              {linkCopied ? <Check className="size-4" /> : <Link2 className="size-4" />}
              Copy Invite Link
            </Button>

            <Button
              variant="outline"
              disabled={!invite}
              render={<a href={invite ? whatsappUrl(phone.trim() ? `91${phone.trim()}` : "", shareMessage) : "#"} target="_blank" rel="noreferrer" />}
            >
              <MessageCircle className="size-4 text-emerald-600" />
              WhatsApp
            </Button>

            <Button
              variant="outline"
              disabled={!invite}
              render={
                <a
                  href={
                    invite
                      ? mailtoUrl(email.trim(), "You're invited to join a Let's Split group on Home Inventory", shareMessage)
                      : "#"
                  }
                />
              }
            >
              <Mail className="size-4" />
              Email
            </Button>
          </div>

          {invite && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Invite link</Label>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{invite.inviteUrl}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(invite.inviteUrl);
                    setLinkCopied(true);
                    toast("Invite link copied!");
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                >
                  {linkCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Expires in 24 hours, or once someone joins with it.</p>
            </div>
          )}

          {loading && <p className="text-sm text-muted-foreground">Generating your invite link…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </Button>
          {invite && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  const result = await createSplitGroupInvite(groupId, {
                    phone: phone.trim() || undefined,
                    email: email.trim() || undefined,
                    forceNew: true,
                  });
                  if ("error" in result) {
                    setError(result.error);
                    return;
                  }
                  setInvite(result);
                  toast("New invite link generated.");
                });
              }}
            >
              Create New Invite
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
