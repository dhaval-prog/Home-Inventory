import { SearchPageClient } from "@/components/search/search-page-client";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { getItemsWithPaths } from "@/lib/items-data";

export default async function SearchPage() {
  const supabase = await createClient();
  const [{ recentItems, topAreas }, allItems] = await Promise.all([
    getDashboardData(supabase),
    getItemsWithPaths(supabase),
  ]);
  return <SearchPageClient recentItems={recentItems} topAreas={topAreas} allItems={allItems} />;
}
