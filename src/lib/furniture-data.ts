import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Furniture, Home, Item, Room, StorageLocation } from "@/lib/supabase/types";

export interface StorageLocationWithItems {
  location: StorageLocation;
  items: Item[];
}

export interface FurnitureDetail {
  home: Home;
  room: Room;
  furniture: Furniture;
  locations: StorageLocationWithItems[];
  totalItems: number;
}

export async function getFurnitureDetail(
  supabase: SupabaseClient<Database>,
  furnitureId: string
): Promise<FurnitureDetail | null> {
  const { data: furniture } = await supabase.from("furniture").select("*").eq("id", furnitureId).maybeSingle();
  if (!furniture) return null;

  const { data: room } = await supabase.from("rooms").select("*").eq("id", furniture.room_id).maybeSingle();
  if (!room) return null;

  const { data: home } = await supabase.from("homes").select("*").eq("id", room.home_id).maybeSingle();
  if (!home) return null;

  const { data: locations } = await supabase
    .from("storage_locations")
    .select("*")
    .eq("furniture_id", furnitureId)
    .is("parent_id", null)
    .order("sort_order", { ascending: true });

  const locationIds = (locations ?? []).map((l) => l.id);
  const { data: items } = locationIds.length
    ? await supabase
        .from("items")
        .select("*")
        .in("storage_location_id", locationIds)
        .order("created_at", { ascending: false })
    : { data: [] as Item[] };

  const locationsWithItems: StorageLocationWithItems[] = (locations ?? []).map((location) => ({
    location,
    items: (items ?? []).filter((i) => i.storage_location_id === location.id),
  }));

  return {
    home,
    room,
    furniture,
    locations: locationsWithItems,
    totalItems: items?.length ?? 0,
  };
}
