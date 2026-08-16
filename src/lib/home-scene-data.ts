import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Furniture, Home, Room } from "@/lib/supabase/types";

export interface SceneItemSummary {
  id: string;
  name: string;
  category: string;
}

export interface HomeSceneData {
  home: Home;
  rooms: Room[];
  furnitureByRoom: Record<string, Furniture[]>;
  itemsByFurniture: Record<string, SceneItemSummary[]>;
}

/**
 * One consolidated fetch for everything the 3D scene needs: rooms,
 * furniture grouped by room, and items grouped by furniture (for hover
 * "what's in here" tooltips) — used by the dashboard preview, the /home
 * 3D view, and the focused item-detail scene.
 */
export async function getHomeSceneData(
  supabase: SupabaseClient<Database>,
  homeId: string
): Promise<HomeSceneData | null> {
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
    ? await supabase.from("storage_locations").select("id, furniture_id").in("furniture_id", furnitureIds)
    : { data: [] as { id: string; furniture_id: string }[] };

  const storageIds = (storageLocations ?? []).map((s) => s.id);
  const { data: items } = storageIds.length
    ? await supabase.from("items").select("id, name, category, storage_location_id").in("storage_location_id", storageIds)
    : { data: [] as { id: string; name: string; category: string; storage_location_id: string }[] };

  const storageToFurniture = new Map((storageLocations ?? []).map((s) => [s.id, s.furniture_id]));
  const itemsByFurniture: Record<string, SceneItemSummary[]> = {};
  for (const item of items ?? []) {
    const furnitureId = storageToFurniture.get(item.storage_location_id);
    if (!furnitureId) continue;
    (itemsByFurniture[furnitureId] ??= []).push({ id: item.id, name: item.name, category: item.category });
  }

  const furnitureByRoom: Record<string, Furniture[]> = {};
  for (const room of rooms ?? []) {
    furnitureByRoom[room.id] = (furniture ?? []).filter((f) => f.room_id === room.id);
  }

  return { home, rooms: rooms ?? [], furnitureByRoom, itemsByFurniture };
}
