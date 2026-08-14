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

export interface NewItemInput {
  storageLocationId: string;
  name: string;
  category?: string;
  description?: string | null;
  quantity?: number;
  container?: string | null;
  photoUrl?: string | null;
  tags?: string[];
  isFavorite?: boolean;
  isImportant?: boolean;
}

/** Shared insert logic used by both the manual form action and voice-add. */
async function insertItemRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: NewItemInput
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Please give the item a name." };
  if (!input.storageLocationId) return { error: "Please choose where this item is stored." };

  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: userId,
      storage_location_id: input.storageLocationId,
      name,
      category: input.category ?? "other",
      description: input.description ?? null,
      quantity: input.quantity ?? 1,
      container: input.container ?? null,
      photo_url: input.photoUrl ?? null,
      tags: input.tags ?? [],
      is_favorite: input.isFavorite ?? false,
      is_important: input.isImportant ?? false,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Something went wrong while saving this item. Please try again." };
  return { id: data.id };
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
  const roomId = String(formData.get("roomId") ?? "");
  const furnitureId = String(formData.get("furnitureId") ?? "");

  const { url, error: uploadError } = await uploadPhotoIfPresent(supabase, user.id, formData);
  if (uploadError) return { error: uploadError };

  const result = await insertItemRow(supabase, user.id, {
    storageLocationId,
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "other"),
    description: String(formData.get("description") ?? "") || null,
    quantity: Number(formData.get("quantity") ?? 1) || 1,
    container: String(formData.get("container") ?? "") || null,
    photoUrl: url ?? null,
    tags: parseTags(String(formData.get("tags") ?? "")),
    isFavorite: formData.get("isFavorite") === "on",
    isImportant: formData.get("isImportant") === "on",
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/home/rooms/${roomId}/furniture/${furnitureId}`);
  revalidatePath("/items");
  revalidatePath("/dashboard");
  redirect(`/home/rooms/${roomId}/furniture/${furnitureId}`);
}

/**
 * Voice-add counterpart to createItem — same insertItemRow logic and the
 * same `items` table/model, just a plain-object signature instead of a
 * <form> FormData binding (voice input is assembled from parsed speech, not
 * a form submit) and it reports success instead of redirecting, since the
 * confirm-card UI decides what happens next.
 */
export async function createItemFromVoice(
  input: NewItemInput & { roomId: string; furnitureId: string }
): Promise<{ itemId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const result = await insertItemRow(supabase, user.id, input);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/home/rooms/${input.roomId}/furniture/${input.furnitureId}`);
  revalidatePath("/items");
  revalidatePath("/dashboard");
  return { itemId: result.id };
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
