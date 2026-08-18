import Link from "next/link";
import { Home } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSplitInvitePreview } from "@/lib/actions/split-invites";
import { JoinSplitGroupCard } from "@/components/household/split/join-split-group-card";

/**
 * Public entry point for a Let's Split invite link — deliberately outside
 * both the (auth) and (app) route groups (see PUBLIC_PATHS in
 * src/lib/supabase/middleware.ts) so it can show a safe preview to visitors
 * who aren't logged in yet, before asking them to sign up or log in (spec
 * §6). getSplitInvitePreview() only ever returns group/household/inviter
 * names — never a balance, an amount, or anyone else's data (spec §7).
 */
export default async function JoinSplitGroupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const preview = await getSplitInvitePreview(token);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Home className="size-5" />
        </span>
        Home Inventory
      </Link>
      <div className="w-full max-w-sm">
        <JoinSplitGroupCard token={token} preview={preview} isLoggedIn={!!user} />
      </div>
    </div>
  );
}
