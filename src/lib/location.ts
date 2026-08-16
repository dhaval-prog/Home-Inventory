import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Furniture, Home, Room, StorageLocation } from "@/lib/supabase/types";

export interface LocationNode {
  type: "home" | "room" | "furniture" | "storage";
  id: string;
  name: string;
  icon: string;
}

export interface LocationIndex {
  homes: Map<string, Home>;
  rooms: Map<string, Room>;
  furniture: Map<string, Furniture>;
  storageLocations: Map<string, StorageLocation>;
}

/**
 * Loads every home/room/furniture/storage_location the current user owns
 * (RLS-scoped) into in-memory maps, so breadcrumb paths for any number of
 * items can be resolved without an N+1 query per item.
 */
export async function buildLocationIndex(
  supabase: SupabaseClient<Database>
): Promise<LocationIndex> {
  const [homesRes, roomsRes, furnitureRes, storageRes] = await Promise.all([
    supabase.from("homes").select("*"),
    supabase.from("rooms").select("*"),
    supabase.from("furniture").select("*"),
    supabase.from("storage_locations").select("*"),
  ]);

  return {
    homes: new Map((homesRes.data ?? []).map((h) => [h.id, h])),
    rooms: new Map((roomsRes.data ?? []).map((r) => [r.id, r])),
    furniture: new Map((furnitureRes.data ?? []).map((f) => [f.id, f])),
    storageLocations: new Map((storageRes.data ?? []).map((s) => [s.id, s])),
  };
}

export function pathForStorageLocation(
  index: LocationIndex,
  storageLocationId: string
): LocationNode[] | null {
  const storageChain: StorageLocation[] = [];
  let current = index.storageLocations.get(storageLocationId);
  while (current) {
    storageChain.unshift(current);
    current = current.parent_id ? index.storageLocations.get(current.parent_id) : undefined;
  }
  if (storageChain.length === 0) return null;

  const furniture = index.furniture.get(storageChain[0].furniture_id);
  if (!furniture) return null;
  const room = index.rooms.get(furniture.room_id);
  if (!room) return null;
  const home = index.homes.get(room.home_id);
  if (!home) return null;

  return [
    { type: "home", id: home.id, name: home.name, icon: "Home" },
    { type: "room", id: room.id, name: room.name, icon: room.icon },
    { type: "furniture", id: furniture.id, name: furniture.name, icon: furniture.icon },
    ...storageChain.map((s) => ({ type: "storage" as const, id: s.id, name: s.name, icon: "Rows3" })),
  ];
}

export function breadcrumbText(nodes: LocationNode[], container?: string | null): string {
  const parts = nodes.map((n) => n.name);
  if (container) parts.push(container);
  return parts.join(" → ");
}
