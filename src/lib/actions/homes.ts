"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROOM_TEMPLATES } from "@/lib/constants";
import type { HomeType } from "@/lib/supabase/types";

export async function createHome(name: string, homeType: HomeType) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: home, error } = await supabase
    .from("homes")
    .insert({ user_id: user.id, name, home_type: homeType })
    .select()
    .single();

  if (error || !home) throw new Error(error?.message ?? "Failed to create home");

  const template = ROOM_TEMPLATES[homeType];
  if (template.length > 0) {
    await supabase.from("rooms").insert(
      template.map((room, i) => ({
        user_id: user.id,
        home_id: home.id,
        name: room.name,
        type: room.type,
        icon: room.icon,
        sort_order: i,
      }))
    );
  }

  revalidatePath("/dashboard");
  redirect(`/home?id=${home.id}`);
}

export async function renameHome(homeId: string, name: string) {
  const supabase = await createClient();
  await supabase.from("homes").update({ name }).eq("id", homeId);
  revalidatePath("/dashboard");
  revalidatePath("/home");
}

export async function deleteHome(homeId: string) {
  const supabase = await createClient();
  await supabase.from("homes").delete().eq("id", homeId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function addRoom(homeId: string, name: string, type: string, icon: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { count } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("home_id", homeId);

  await supabase.from("rooms").insert({
    user_id: user.id,
    home_id: homeId,
    name,
    type,
    icon,
    sort_order: count ?? 0,
  });

  revalidatePath("/home");
  revalidatePath("/dashboard");
}

export async function renameRoom(roomId: string, name: string) {
  const supabase = await createClient();
  await supabase.from("rooms").update({ name }).eq("id", roomId);
  revalidatePath("/home");
  revalidatePath("/home/rooms/" + roomId);
}

export async function deleteRoom(roomId: string) {
  const supabase = await createClient();
  await supabase.from("rooms").delete().eq("id", roomId);
  revalidatePath("/home");
  redirect("/home");
}

export async function moveRoom(homeId: string, roomId: string, direction: "up" | "down") {
  const supabase = await createClient();
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, sort_order")
    .eq("home_id", homeId)
    .order("sort_order", { ascending: true });
  if (!rooms) return;

  const index = rooms.findIndex((r) => r.id === roomId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= rooms.length) return;

  const a = rooms[index];
  const b = rooms[swapWith];
  await Promise.all([
    supabase.from("rooms").update({ sort_order: b.sort_order }).eq("id", a.id),
    supabase.from("rooms").update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);

  revalidatePath("/home");
}
