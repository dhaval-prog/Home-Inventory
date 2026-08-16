import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "@/components/items/item-form";
import { createItem } from "@/lib/actions/items";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string; furnitureId?: string; storageLocationId?: string; homeId?: string; name?: string }>;
}) {
  const { roomId, furnitureId, storageLocationId, homeId, name } = await searchParams;

  let locationLabel: string | undefined;
  if (roomId && furnitureId && storageLocationId) {
    const supabase = await createClient();
    const [{ data: room }, { data: furniture }, { data: location }] = await Promise.all([
      supabase.from("rooms").select("name").eq("id", roomId).maybeSingle(),
      supabase.from("furniture").select("name").eq("id", furnitureId).maybeSingle(),
      supabase.from("storage_locations").select("name").eq("id", storageLocationId).maybeSingle(),
    ]);
    if (room && furniture && location) {
      locationLabel = `${room.name} → ${furniture.name} → ${location.name}`;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add Item</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what it is and exactly where you&apos;re keeping it.
        </p>
      </div>
      <ItemForm
        action={createItem}
        initialLocation={{ roomId, furnitureId, storageLocationId, homeId }}
        initialName={name}
        locationLabel={locationLabel}
        submitLabel="Save Item"
      />
    </div>
  );
}
