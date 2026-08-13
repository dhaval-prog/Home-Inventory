import { createClient } from "@/lib/supabase/server";
import { getItemsWithPaths } from "@/lib/items-data";
import { ItemList } from "@/components/items/item-list";
import { EmptyState } from "@/components/shared/empty-state";

export default async function ImportantItemsPage() {
  const supabase = await createClient();
  const results = await getItemsWithPaths(supabase, { importantOnly: true });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">⚠️ Important Items</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Passports, property documents, and other things you never want to lose track of.
        </p>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon="AlertTriangle"
          title="Nothing marked important yet"
          description="Mark critical items — passports, insurance papers, spare keys — so they're always one tap away."
        />
      ) : (
        <ItemList results={results} />
      )}
    </div>
  );
}
