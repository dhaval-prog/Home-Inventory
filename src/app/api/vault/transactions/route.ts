import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordVaultTransaction } from "@/lib/vault/ledger";
import type { VaultTransactionType } from "@/lib/supabase/types";

const ALLOWED_TYPES: VaultTransactionType[] = ["add", "deduct", "recurring"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !ALLOWED_TYPES.includes(body.type) || typeof body.amount !== "number") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await recordVaultTransaction(supabase, user.id, {
    type: body.type,
    amount: body.amount,
    category: typeof body.category === "string" ? body.category : null,
    comment: typeof body.comment === "string" ? body.comment : null,
    label: typeof body.label === "string" ? body.label : null,
    source: "manual",
  });

  if (!result.ok) return NextResponse.json({ error: result.error, balance: result.balance }, { status: 400 });
  return NextResponse.json({ transaction: result.transaction, balance: result.balance });
}
