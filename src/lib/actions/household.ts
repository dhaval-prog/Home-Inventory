"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import type { Household, HouseholdInviteRole, HouseholdRole } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Deliberately separate from the existing `homes` table (the single-owner 3D
 * inventory concept) — a household is a group of people sharing vaults and
 * goals, not a physical house model. See supabase/schema.sql's "Households"
 * section for the full schema/RLS this relies on.
 */

export interface HouseholdMemberWithProfile {
  id: string;
  userId: string;
  role: HouseholdRole;
  joinedAt: string;
  name: string;
  avatarUrl: string | null;
  isMe: boolean;
}

export interface HouseholdContext {
  household: Household;
  myRole: HouseholdRole;
  members: HouseholdMemberWithProfile[];
  sharedVaultId: string;
}

export interface HouseholdListEntry {
  household: Household;
  role: HouseholdRole;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function randomCodeSegment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

/** Cosmetic display id only (e.g. HOME-7X92-KLM) — never the actual authorization boundary; see generateInvite/joinHousehold for that. */
function generateHouseholdCode(): string {
  return `HOME-${randomCodeSegment(4)}-${randomCodeSegment(3)}`;
}

async function insertHouseholdWithUniqueCode(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  name: string
): Promise<{ household: Household | null; error: string | null }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("households")
      .insert({ code: generateHouseholdCode(), name, owner_id: ownerId })
      .select()
      .single();
    if (!error) return { household: data, error: null };
    if (error.code !== "23505") return { household: null, error: error.message };
  }
  return { household: null, error: "Couldn't generate a unique household code — please try again." };
}

export async function createHousehold(name: string): Promise<{ householdId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = name.trim() || "Our Home";
  const { household, error } = await insertHouseholdWithUniqueCode(supabase, user.id, trimmed);
  if (error || !household) return { error: error ?? "Failed to create household" };

  revalidatePath("/dashboard");
  revalidatePath("/household");
  return { householdId: household.id };
}

/** All households the current user belongs to, with their role in each — RLS already scopes `households` to memberships, this just attaches the role. */
export async function listMyHouseholds(): Promise<HouseholdListEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase.from("household_members").select("household_id, role").eq("user_id", user.id);
  if (!memberships || memberships.length === 0) return [];

  const { data: households } = await supabase
    .from("households")
    .select("*")
    .in(
      "id",
      memberships.map((m) => m.household_id)
    );
  const roleById = new Map(memberships.map((m) => [m.household_id, m.role]));

  return (households ?? [])
    .map((h) => ({ household: h, role: roleById.get(h.id) ?? "viewer" }))
    .sort((a, b) => (a.household.created_at < b.household.created_at ? 1 : -1));
}

/** Full household context for a page load: household row, the caller's role, the member roster (with display names), and the id of the household's one auto-created shared vault. Returns null if the caller isn't a member (RLS would also block the underlying reads, but this fails fast with a clear signal). */
export async function getHouseholdContext(householdId: string): Promise<HouseholdContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: household } = await supabase.from("households").select("*").eq("id", householdId).single();
  if (!household) return null;

  const { data: members } = await supabase.from("household_members").select("*").eq("household_id", householdId);
  const myMembership = (members ?? []).find((m) => m.user_id === user.id);
  if (!myMembership) return null;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in(
      "id",
      (members ?? []).map((m) => m.user_id)
    );
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: sharedVault } = await supabase
    .from("household_vaults")
    .select("id")
    .eq("household_id", householdId)
    .eq("vault_type", "shared")
    .single();

  return {
    household,
    myRole: myMembership.role,
    members: (members ?? [])
      .map((m) => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at,
        name: displayName(profileById.get(m.user_id)),
        avatarUrl: profileById.get(m.user_id)?.avatar_url ?? null,
        isMe: m.user_id === user.id,
      }))
      .sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1)),
    sharedVaultId: sharedVault?.id ?? "",
  };
}

export async function generateInvite(
  householdId: string,
  role: HouseholdInviteRole
): Promise<{ token: string; expiresAt: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const token = randomBytes(24).toString("base64url");
  const { data, error } = await supabase
    .from("household_invites")
    .insert({ household_id: householdId, token, created_by: user.id, role })
    .select()
    .single();
  if (error || !data)
    return { error: error?.message ?? "Failed to create invite. Only the household owner or a co-owner can invite members." };

  revalidatePath("/household");
  return { token: data.token, expiresAt: data.expires_at };
}

export async function joinHousehold(token: string): Promise<{ householdId: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_household_invite", { p_token: token.trim() });
  if (error || !data?.ok) return { error: error?.message ?? "That invite code is invalid or has expired." };

  revalidatePath("/dashboard");
  revalidatePath("/household");
  return { householdId: data.household_id };
}

export async function removeMember(householdId: string, memberUserId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("household_members").delete().eq("household_id", householdId).eq("user_id", memberUserId);
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { ok: true };
}

/**
 * Household ownership is never transferred through this action — only the
 * roles below can be assigned. RLS (household_members_update_owner) already
 * restricts the *caller* to the household owner; this restricts the *target*
 * role so an owner can't accidentally (or a compromised client can't) mint a
 * second owner.
 */
export async function updateMemberRole(
  householdId: string,
  memberUserId: string,
  role: Exclude<HouseholdRole, "owner">
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("household_members").update({ role }).eq("household_id", householdId).eq("user_id", memberUserId);
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { ok: true };
}

/** Promotes a member to co-owner — only the household owner can do this (enforced by household_members_update_owner RLS, not just this call site). A co-owner immediately gains invite rights (can_invite_to_household) and everything a contributing member already had. */
export async function promoteToCoOwner(householdId: string, memberUserId: string): Promise<{ ok: true } | { error: string }> {
  return updateMemberRole(householdId, memberUserId, "co_owner");
}
