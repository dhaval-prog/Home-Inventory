import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDueRecurringDeposits } from "@/lib/vault/recurring";

/**
 * Triggered daily by Vercel Cron (see vercel.json). Runs with no logged-in
 * user — Vercel sends `Authorization: Bearer <CRON_SECRET>` on scheduled
 * invocations, checked here so this can't be triggered by anyone else.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runDueRecurringDeposits(admin);
  return NextResponse.json(result);
}
