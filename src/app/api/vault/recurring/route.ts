import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRecurringPlan, upsertRecurringPlan } from "@/lib/vault/recurring";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const plan = await getRecurringPlan(supabase, user.id);
  return NextResponse.json({ plan });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.amount !== "number" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await upsertRecurringPlan(supabase, user.id, {
    amount: body.amount,
    scheduleMode: body.scheduleMode === "date" ? "date" : "salary",
    dayOfMonth: typeof body.dayOfMonth === "number" ? body.dayOfMonth : 1,
    enabled: body.enabled,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ plan: result.plan });
}
