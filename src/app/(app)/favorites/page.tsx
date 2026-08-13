import { createClient } from "@/lib/supabase/server";
import { getItemsWithPaths } from "@/lib/items-data";
import { ItemList } from "@/components/items/item-list";
import { EmptyState } from "@/components/shared/empty-state";

export default async function FavoritesPage() {
  const supabase = await createClient();
  const results = await getItemsWithPaths(supabase, { favoritesOnly: true });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">⭐ Favorites</h1>
        <p className="mt-1 text-sm text-muted-foreground">Items you search for often.</p>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon="Star"
          title="No favorites yet"
          description="Star items you look for often so you can find them here instantly."
        />
      ) : (
        <ItemList results={results} />
      )}
    </div>
  );
}
