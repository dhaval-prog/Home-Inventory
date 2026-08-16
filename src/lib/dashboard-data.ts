import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Home, Item } from "@/lib/supabase/types";
import { buildLocationIndex, pathForStorageLocation, type LocationNode } from "@/lib/location";

export interface HomeStats {
  home: Home;
  roomCount: number;
  furnitureCount: number;
  itemCount: number;
}

export interface RecentItem {
  item: Item;
  path: LocationNode[];
}

export interface StorageAreaUsage {
  furnitureId: string;
  furnitureName: string;
  roomName: string;
  icon: string;
  itemCount: number;
}

export interface DashboardData {
  homes: HomeStats[];
  recentItems: RecentItem[];
  topAreas: StorageAreaUsage[];
  totals: { rooms: number; furniture: number; items: number; categories: number; noPhoto: number };
}

export async function getDashboardData(supabase: SupabaseClient<Database>): Promise<DashboardData> {
  const index = await buildLocationIndex(supabase);
  const { data: homesData } = await supabase.from("homes").select("*").order("created_at", { ascending: true });
  const { data: itemsData } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  const homes = homesData ?? [];
  const items = itemsData ?? [];

  const roomsByHome = new Map<string, number>();
  for (const room of index.rooms.values()) {
    roomsByHome.set(room.home_id, (roomsByHome.get(room.home_id) ?? 0) + 1);
  }

  const furnitureByHome = new Map<string, number>();
  const roomHome = new Map(Array.from(index.rooms.values()).map((r) => [r.id, r.home_id]));
  for (const f of index.furniture.values()) {
    const homeId = roomHome.get(f.room_id);
    if (!homeId) continue;
    furnitureByHome.set(homeId, (furnitureByHome.get(homeId) ?? 0) + 1);
  }

  const itemsByHome = new Map<string, number>();
  const itemsByFurniture = new Map<string, number>();
  for (const item of items) {
    const path = pathForStorageLocation(index, item.storage_location_id);
    if (!path) continue;
    const home = path.find((n) => n.type === "home");
    const furniture = path.find((n) => n.type === "furniture");
    if (home) itemsByHome.set(home.id, (itemsByHome.get(home.id) ?? 0) + 1);
    if (furniture) itemsByFurniture.set(furniture.id, (itemsByFurniture.get(furniture.id) ?? 0) + 1);
  }

  const homeStats: HomeStats[] = homes.map((home) => ({
    home,
    roomCount: roomsByHome.get(home.id) ?? 0,
    furnitureCount: furnitureByHome.get(home.id) ?? 0,
    itemCount: itemsByHome.get(home.id) ?? 0,
  }));

  const recentItems: RecentItem[] = [];
  for (const item of items.slice(0, 8)) {
    const path = pathForStorageLocation(index, item.storage_location_id);
    if (path) recentItems.push({ item, path });
  }

  const topAreas: StorageAreaUsage[] = Array.from(itemsByFurniture.entries())
    .map(([furnitureId, itemCount]) => {
      const furniture = index.furniture.get(furnitureId);
      const room = furniture ? index.rooms.get(furniture.room_id) : undefined;
      return {
        furnitureId,
        furnitureName: furniture?.name ?? "Unknown",
        roomName: room?.name ?? "",
        icon: furniture?.icon ?? "Package",
        itemCount,
      };
    })
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, 5);

  const categories = new Set(items.map((i) => i.category));

  return {
    homes: homeStats,
    recentItems,
    topAreas,
    totals: {
      rooms: index.rooms.size,
      furniture: index.furniture.size,
      items: items.length,
      categories: categories.size,
      noPhoto: items.filter((i) => !i.photo_url).length,
    },
  };
}
