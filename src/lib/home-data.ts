import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Furniture, Home, Room, StorageLocation } from "@/lib/supabase/types";

export interface RoomWithFurniture {
  room: Room;
  furniture: (Furniture & { itemCount: number })[];
  itemCount: number;
}

export interface HomeViewData {
  home: Home;
  rooms: RoomWithFurniture[];
  totals: { items: number; noPhoto: number };
}

export async function getHomeViewData(
  supabase: SupabaseClient<Database>,
  homeId: string
): Promise<HomeViewData | null> {
  const { data: home } = await supabase.from("homes").select("*").eq("id", homeId).maybeSingle();
  if (!home) return null;

  const { data: rooms } = await supabase
    .from("rooms")
    .select("*")
    .eq("home_id", homeId)
    .order("sort_order", { ascending: true });

  const roomIds = (rooms ?? []).map((r) => r.id);
  const { data: furniture } = roomIds.length
    ? await supabase.from("furniture").select("*").in("room_id", roomIds).order("sort_order", { ascending: true })
    : { data: [] as Furniture[] };

  const furnitureIds = (furniture ?? []).map((f) => f.id);
  const { data: storageLocations } = furnitureIds.length
    ? await supabase.from("storage_locations").select("*").in("furniture_id", furnitureIds)
    : { data: [] as StorageLocation[] };

  const storageIds = (storageLocations ?? []).map((s) => s.id);
  const { data: items } = storageIds.length
    ? await supabase
        .from("items")
        .select("id, storage_location_id, photo_url")
        .in("storage_location_id", storageIds)
    : { data: [] as { id: string; storage_location_id: string; photo_url: string | null }[] };

  const storageToFurniture = new Map((storageLocations ?? []).map((s) => [s.id, s.furniture_id]));
  const itemCountByFurniture = new Map<string, number>();
  for (const item of items ?? []) {
    const furnitureId = storageToFurniture.get(item.storage_location_id);
    if (!furnitureId) continue;
    itemCountByFurniture.set(furnitureId, (itemCountByFurniture.get(furnitureId) ?? 0) + 1);
  }

  const roomsWithFurniture: RoomWithFurniture[] = (rooms ?? []).map((room) => {
    const roomFurniture = (furniture ?? [])
      .filter((f) => f.room_id === room.id)
      .map((f) => ({ ...f, itemCount: itemCountByFurniture.get(f.id) ?? 0 }));
    return {
      room,
      furniture: roomFurniture,
      itemCount: roomFurniture.reduce((sum, f) => sum + f.itemCount, 0),
    };
  });

  const totals = {
    items: (items ?? []).length,
    noPhoto: (items ?? []).filter((i) => !i.photo_url).length,
  };

  return { home, rooms: roomsWithFurniture, totals };
}
