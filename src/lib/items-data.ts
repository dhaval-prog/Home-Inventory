import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buildLocationIndex, pathForStorageLocation } from "@/lib/location";
import type { SearchResult } from "@/lib/actions/search";

export async function getItemsWithPaths(
  supabase: SupabaseClient<Database>,
  options?: { favoritesOnly?: boolean; importantOnly?: boolean }
): Promise<SearchResult[]> {
  const index = await buildLocationIndex(supabase);

  let query = supabase.from("items").select("*").order("created_at", { ascending: false });
  if (options?.favoritesOnly) query = query.eq("is_favorite", true);
  if (options?.importantOnly) query = query.eq("is_important", true);

  const { data: items } = await query;

  const results: SearchResult[] = [];
  for (const item of items ?? []) {
    const path = pathForStorageLocation(index, item.storage_location_id);
    if (path) results.push({ item, path });
  }
  return results;
}
