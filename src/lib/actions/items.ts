"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Item } from "@/lib/supabase/types";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface ItemFormState {
  error?: string;
}

async function uploadPhotoIfPresent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return {};

  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "This image is too large. Please upload an image smaller than 5MB." };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("item-photos").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) return { error: "Something went wrong while uploading the photo. Please try again." };

  const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
  return { url: data.publicUrl };
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function createItem(
  _prevState: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const storageLocationId = String(formData.get("storageLocationId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const roomId = String(formData.get("roomId") ?? "");
  const furnitureId = String(formData.get("furnitureId") ?? "");

  if (!name) return { error: "Please give the item a name." };
  if (!storageLocationId) return { error: "Please choose where this item is stored." };

  const { url, error: uploadError } = await uploadPhotoIfPresent(supabase, user.id, formData);
  if (uploadError) return { error: uploadError };

  const { error } = await supabase.from("items").insert({
    user_id: user.id,
    storage_location_id: storageLocationId,
    name,
    category: String(formData.get("category") ?? "other"),
    description: String(formData.get("description") ?? "") || null,
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    container: String(formData.get("container") ?? "") || null,
    photo_url: url ?? null,
    tags: parseTags(String(formData.get("tags") ?? "")),
    is_favorite: formData.get("isFavorite") === "on",
    is_important: formData.get("isImportant") === "on",
  });

  if (error) return { error: "Something went wrong while saving this item. Please try again." };

  revalidatePath(`/home/rooms/${roomId}/furniture/${furnitureId}`);
  revalidatePath("/items");
  revalidatePath("/dashboard");
  redirect(`/home/rooms/${roomId}/furniture/${furnitureId}`);
}

export async function updateItem(
  itemId: string,
  roomId: string,
  furnitureId: string,
  _prevState: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Please give the item a name." };

  const { url, error: uploadError } = await uploadPhotoIfPresent(supabase, user.id, formData);
  if (uploadError) return { error: uploadError };

  const update: Partial<Item> = {
    name,
    category: String(formData.get("category") ?? "other"),
    description: String(formData.get("description") ?? "") || null,
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    container: String(formData.get("container") ?? "") || null,
    tags: parseTags(String(formData.get("tags") ?? "")),
    is_favorite: formData.get("isFavorite") === "on",
    is_important: formData.get("isImportant") === "on",
  };
  if (url) update.photo_url = url;

  const { error } = await supabase.from("items").update(update).eq("id", itemId);
  if (error) return { error: "Something went wrong while saving this item. Please try again." };

  revalidatePath(`/items/${itemId}`);
  revalidatePath(`/home/rooms/${roomId}/furniture/${furnitureId}`);
  redirect(`/items/${itemId}`);
}

export async function deleteItem(itemId: string) {
  const supabase = await createClient();
  await supabase.from("items").delete().eq("id", itemId);
  revalidatePath("/items");
  revalidatePath("/dashboard");
  redirect("/items");
}

export async function moveItem(itemId: string, newStorageLocationId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ storage_location_id: newStorageLocationId })
    .eq("id", itemId);

  if (error) throw new Error("Something went wrong while moving this item. Please try again.");

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/items");
  redirect(`/items/${itemId}`);
}

export async function toggleFavorite(itemId: string, value: boolean) {
  const supabase = await createClient();
  await supabase.from("items").update({ is_favorite: value }).eq("id", itemId);
  revalidatePath("/favorites");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/items");
}

export async function toggleImportant(itemId: string, value: boolean) {
  const supabase = await createClient();
  await supabase.from("items").update({ is_important: value }).eq("id", itemId);
  revalidatePath("/important");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/items");
}
