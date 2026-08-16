"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addStorageLocation(
  furnitureId: string,
  roomId: string,
  name: string,
  type: string = "shelf",
  parentId?: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { count } = await supabase
    .from("storage_locations")
    .select("id", { count: "exact", head: true })
    .eq("furniture_id", furnitureId);

  const { error } = await supabase.from("storage_locations").insert({
    user_id: user.id,
    furniture_id: furnitureId,
    parent_id: parentId || null,
    name,
    type,
    sort_order: count ?? 0,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/home/rooms/${roomId}/furniture/${furnitureId}`);
}

export async function renameStorageLocation(
  storageLocationId: string,
  roomId: string,
  furnitureId: string,
  name: string
) {
  const supabase = await createClient();
  await supabase.from("storage_locations").update({ name }).eq("id", storageLocationId);
  revalidatePath(`/home/rooms/${roomId}/furniture/${furnitureId}`);
}

export async function deleteStorageLocation(storageLocationId: string, roomId: string, furnitureId: string) {
  const supabase = await createClient();
  await supabase.from("storage_locations").delete().eq("id", storageLocationId);
  revalidatePath(`/home/rooms/${roomId}/furniture/${furnitureId}`);
}
