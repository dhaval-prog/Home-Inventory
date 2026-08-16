import { createClient } from "@/lib/supabase/server";
import { getItemsWithPaths } from "@/lib/items-data";
import { ItemList } from "@/components/items/item-list";
import { EmptyState } from "@/components/shared/empty-state";

export default async function RecentItemsPage() {
  const supabase = await createClient();
  const results = (await getItemsWithPaths(supabase)).slice(0, 30);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recently Added</h1>
        <p className="mt-1 text-sm text-muted-foreground">The last things you added to your home.</p>
      </div>

      {results.length === 0 ? (
        <EmptyState icon="Clock" title="Nothing added yet" description="Items you add will show up here first." />
      ) : (
        <ItemList results={results} />
      )}
    </div>
  );
}
