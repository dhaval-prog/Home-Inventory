"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptSplitGroupInvite } from "@/lib/actions/split-invites";
import type { SplitInvitePreview } from "@/lib/actions/split-invites";

const REASON_COPY: Record<NonNullable<SplitInvitePreview["reason"]>, { title: string; description: string }> = {
  invalid: { title: "Invite not found", description: "This invitation link is invalid." },
  expired: { title: "This invitation has expired", description: "Ask whoever invited you to send a new invite link." },
  revoked: { title: "Invite no longer available", description: "This invitation is no longer available." },
  already_accepted: { title: "Already used", description: "This invitation has already been used." },
};

export function JoinSplitGroupCard({
  token,
  preview,
  isLoggedIn,
}: {
  token: string;
  preview: SplitInvitePreview;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!preview.valid) {
    const copy = REASON_COPY[preview.reason ?? "invalid"];
    return (
      <Card>
        <CardHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <CardTitle className="text-xl">{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link href="/household" />}>
            Return to Home Inventory
          </Button>
        </CardContent>
      </Card>
    );
  }

  const redirectTo = `/join/${token}`;

  if (!isLoggedIn) {
    return (
      <Card>
        <CardHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <CardTitle className="text-xl">You&apos;re invited</CardTitle>
          <CardDescription>
            {preview.inviterName} invited you to join <span className="font-medium text-foreground">&ldquo;{preview.groupName}&rdquo;</span> on
            Let&apos;s Split — {preview.householdName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" render={<Link href={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`} />}>
            Sign up to join
          </Button>
          <Button variant="outline" className="w-full" render={<Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} />}>
            Log in to join
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (preview.alreadyMember) {
    return (
      <Card>
        <CardHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <CardTitle className="text-xl">You&apos;re already in</CardTitle>
          <CardDescription>You&apos;re already a member of this Split group.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.push(preview.householdId ? `/household?id=${preview.householdId}` : "/household")}>
            Go to Split group
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="size-5" />
        </div>
        <CardTitle className="text-xl">Join &ldquo;{preview.groupName}&rdquo;</CardTitle>
        <CardDescription>
          {preview.inviterName} invited you to split shared expenses together on Let&apos;s Split. You&apos;ll only see this group&apos;s
          expenses and balances — nothing else in {preview.householdName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await acceptSplitGroupInvite(token);
              if ("error" in result) {
                setError(result.error);
                return;
              }
              router.push(`/household?id=${result.householdId}`);
            })
          }
        >
          {pending ? "Joining…" : "Join Split Group"}
        </Button>
      </CardContent>
    </Card>
  );
}
