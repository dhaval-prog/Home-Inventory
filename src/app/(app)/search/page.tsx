import { SearchPageClient } from "@/components/search/search-page-client";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function SearchPage() {
  const supabase = await createClient();
  const { recentItems, topAreas } = await getDashboardData(supabase);
  return <SearchPageClient recentItems={recentItems} topAreas={topAreas} />;
}
