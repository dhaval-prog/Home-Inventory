import type { SupabaseClient } from "@supabase/supabase-js";
import { recordVaultTransaction } from "@/lib/vault/ledger";
import type { Database, VaultRecurringPlan, VaultRecurringScheduleMode } from "@/lib/supabase/types";

export async function getRecurringPlan(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<VaultRecurringPlan | null> {
  const { data } = await supabase.from("vault_recurring_plans").select("*").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

/** Next occurrence strictly after `from` — "salary" mode always lands on the 1st, "date" mode on the chosen day. */
export function computeNextRunDate(from: Date, scheduleMode: VaultRecurringScheduleMode, dayOfMonth: number): Date {
  const day = scheduleMode === "salary" ? 1 : dayOfMonth;
  return new Date(from.getFullYear(), from.getMonth() + 1, day);
}

export interface UpsertRecurringPlanInput {
  amount: number;
  scheduleMode: VaultRecurringScheduleMode;
  dayOfMonth: number;
  enabled: boolean;
}

export type UpsertRecurringPlanResult = { ok: true; plan: VaultRecurringPlan } | { ok: false; error: string };

/**
 * One plan per user (matches the vault UI's single Recurring Savings
 * toggle) — creating or editing it always recomputes next_run_date from
 * today so a schedule change takes effect on its next real occurrence
 * rather than possibly firing immediately on a stale date.
 */
export async function upsertRecurringPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpsertRecurringPlanInput,
  now: Date = new Date()
): Promise<UpsertRecurringPlanResult> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid monthly amount." };
  if (input.dayOfMonth < 1 || input.dayOfMonth > 28) return { ok: false, error: "Pick a day between 1 and 28." };

  const nextRunDate = computeNextRunDate(now, input.scheduleMode, input.dayOfMonth);

  const { data, error } = await supabase
    .from("vault_recurring_plans")
    .upsert(
      {
        user_id: userId,
        amount,
        schedule_mode: input.scheduleMode,
        day_of_month: input.dayOfMonth,
        enabled: input.enabled,
        next_run_date: nextRunDate.toISOString().slice(0, 10),
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    console.error("vault: failed to upsert vault_recurring_plans row —", error?.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true, plan: data };
}

export interface RecurringRunSummary {
  processed: number;
  errors: string[];
}

/**
 * The cron entry point (src/app/api/vault/cron/recurring-run) — deposits
 * every plan due today and advances it to its next occurrence. Runs with a
 * service-role client since there's no logged-in user in a scheduled job.
 */
export async function runDueRecurringDeposits(
  supabase: SupabaseClient<Database>,
  today: Date = new Date()
): Promise<RecurringRunSummary> {
  const todayStr = today.toISOString().slice(0, 10);
  const { data: duePlans, error } = await supabase
    .from("vault_recurring_plans")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_date", todayStr);

  if (error) {
    console.error("vault: failed to load due vault_recurring_plans —", error.message);
    return { processed: 0, errors: [error.message] };
  }

  let processed = 0;
  const errors: string[] = [];

  for (const plan of duePlans ?? []) {
    const result = await recordVaultTransaction(supabase, plan.user_id, {
      type: "recurring",
      amount: plan.amount,
      label: "Monthly Auto-Save",
      source: "scheduled",
    });
    if (!result.ok) {
      errors.push(`plan ${plan.id}: ${result.error}`);
      continue;
    }

    const nextRunDate = computeNextRunDate(new Date(plan.next_run_date), plan.schedule_mode, plan.day_of_month);
    await supabase
      .from("vault_recurring_plans")
      .update({ next_run_date: nextRunDate.toISOString().slice(0, 10), last_run_at: today.toISOString() })
      .eq("id", plan.id);
    processed++;
  }

  return { processed, errors };
}
