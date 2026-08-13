"use server";

import { createClient } from "@/lib/supabase/server";

export async function listHomes() {
  const supabase = await createClient();
  const { data } = await supabase.from("homes").select("id, name").order("created_at", { ascending: true });
  return data ?? [];
}

export async function listRooms(homeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, name, icon")
    .eq("home_id", homeId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function listFurniture(roomId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("furniture")
    .select("id, name, icon, type")
    .eq("room_id", roomId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function listStorageLocations(furnitureId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name")
    .eq("furniture_id", furnitureId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}
