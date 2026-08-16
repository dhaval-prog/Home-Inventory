import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildLocationIndex, pathForStorageLocation, breadcrumbText } from "@/lib/location";
import { ItemForm } from "@/components/items/item-form";
import { updateItem } from "@/lib/actions/items";

export default async function EditItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
  if (!item) notFound();

  const index = await buildLocationIndex(supabase);
  const path = pathForStorageLocation(index, item.storage_location_id);
  if (!path) notFound();

  const room = path.find((n) => n.type === "room")!;
  const furniture = path.find((n) => n.type === "furniture")!;
  const boundAction = updateItem.bind(null, item.id, room.id, furniture.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit Item</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          To change where it&apos;s stored, use the Move action from the item page instead.
        </p>
      </div>
      <ItemForm
        action={boundAction}
        item={item}
        initialLocation={{ roomId: room.id, furnitureId: furniture.id, storageLocationId: item.storage_location_id }}
        locationLabel={breadcrumbText(path, item.container)}
        submitLabel="Save Changes"
        allowLocationChange={false}
      />
    </div>
  );
}
