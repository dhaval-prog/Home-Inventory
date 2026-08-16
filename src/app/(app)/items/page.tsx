import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getItemsWithPaths } from "@/lib/items-data";
import { ItemList } from "@/components/items/item-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default async function AllItemsPage() {
  const supabase = await createClient();
  const results = await getItemsWithPaths(supabase);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Items</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {results.length} item{results.length === 1 ? "" : "s"} across your home.
          </p>
        </div>
        <Button
          size="sm"
          render={
            <Link href="/quick-add?type=item">
              <Plus className="size-4" />
              Add Item
            </Link>
          }
        />
      </div>

      {results.length === 0 ? (
        <EmptyState icon="Package" title="No items yet" description="Nothing stored here yet." />
      ) : (
        <ItemList results={results} />
      )}
    </div>
  );
}
