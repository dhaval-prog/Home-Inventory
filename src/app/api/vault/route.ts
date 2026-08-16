import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVaultSummary } from "@/lib/vault/ledger";

/**
 * The vault's 3D scene (public/vault/vault.html) is a static, non-React
 * iframe with no access to server actions, so it talks to the ledger over
 * plain same-origin JSON fetches instead — hence a Route Handler here
 * rather than the server actions used everywhere else in this app.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const summary = await getVaultSummary(supabase, user.id);
  return NextResponse.json(summary);
}
