import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role client for server contexts with no logged-in user — currently
 * only the recurring-deposit cron job (src/app/api/vault/cron/recurring-run),
 * which must write to every user's vault on a schedule, not just the one
 * tied to a request's session cookies. Bypasses RLS entirely, so this must
 * never be imported into anything reachable from the browser or from a
 * request handler that doesn't independently verify the caller (see the
 * cron route's CRON_SECRET check).
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
