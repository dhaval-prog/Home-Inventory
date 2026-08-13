"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STORAGE_LOCATION_PRESETS } from "@/lib/constants";

export async function addFurniture(
  roomId: string,
  name: string,
  type: string,
  icon: string,
  description?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { count } = await supabase
    .from("furniture")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  const { data: furniture, error } = await supabase
    .from("furniture")
    .insert({
      user_id: user.id,
      room_id: roomId,
      name,
      type,
      icon,
      description: description || null,
      sort_order: count ?? 0,
    })
    .select()
    .single();

  if (error || !furniture) throw new Error(error?.message ?? "Failed to add furniture");

  // Pre-populate common storage locations for this furniture type so the
  // user isn't starting from a completely empty grid (section 9).
  const presets = STORAGE_LOCATION_PRESETS[type] ?? STORAGE_LOCATION_PRESETS.default;
  await supabase.from("storage_locations").insert(
    presets.slice(0, 4).map((presetName, i) => ({
      user_id: user.id,
      furniture_id: furniture.id,
      name: presetName,
      type: "shelf",
      sort_order: i,
    }))
  );

  revalidatePath("/home/rooms/" + roomId);
  return furniture.id as string;
}

export async function renameFurniture(
  furnitureId: string,
  roomId: string,
  name: string,
  description?: string
) {
  const supabase = await createClient();
  await supabase.from("furniture").update({ name, description: description || null }).eq("id", furnitureId);
  revalidatePath(`/home/rooms/${roomId}/furniture/${furnitureId}`);
}

export async function deleteFurniture(furnitureId: string, roomId: string) {
  const supabase = await createClient();
  await supabase.from("furniture").delete().eq("id", furnitureId);
  revalidatePath("/home/rooms/" + roomId);
  redirect("/home/rooms/" + roomId);
}
