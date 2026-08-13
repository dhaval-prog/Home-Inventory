"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ProfileFormState {
  error?: string;
  success?: string;
}

export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Please enter your name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
  if (error) return { error: "Something went wrong while saving. Please try again." };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: "Profile updated." };
}
