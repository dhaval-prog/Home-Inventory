"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/utils";
import { sendSplitInviteSms } from "@/lib/sms/send-split-invite-sms";
import type { SplitGroupInvite as SplitGroupInviteRow, SplitGroupInviteStatus } from "@/lib/supabase/types";

/**
 * Let's Split — group-scoped invite links (spec: "Split Group Invite Links &
 * Multi-Channel Invitation"). The invite link is the one source of truth;
 * SMS/WhatsApp/Email/Copy Link are just delivery channels around the same
 * token — see supabase/schema.sql's "Split Group Invites" section for the
 * table/RLS/RPCs this relies on. Only a split group's own manager
 * (can_manage_split_group — the group's creator or the household owner) can
 * create or revoke its invites; that's enforced by RLS, not just by hiding
 * the UI (see the *_manager policies on split_group_invites).
 */

// Kept in one place so the expiry window can be changed without touching
// call sites — see the matching note on split_group_invites.expires_at's
// column default in supabase/schema.sql.
const INVITE_EXPIRY_HOURS = 24;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_INVITES = 8;

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export interface SplitGroupInvite {
  id: string;
  groupId: string;
  token: string;
  status: SplitGroupInviteStatus;
  phoneNumber: string | null;
  email: string | null;
  expiresAt: string;
  createdAt: string;
  inviteUrl: string;
}

function toInvite(row: SplitGroupInviteRow): SplitGroupInvite {
  return {
    id: row.id,
    groupId: row.group_id,
    token: row.token,
    status: row.status,
    phoneNumber: row.phone_number,
    email: row.email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    inviteUrl: `${siteOrigin()}/join/${row.token}`,
  };
}

/**
 * Normalizes to E.164-ish international format (+91XXXXXXXXXX for a bare
 * 10-digit Indian number, +<digits> if a country code was already typed) —
 * never stores more than one shape for the same number (spec §12). Returns
 * null for anything that doesn't look like a valid Indian mobile number,
 * since +91 is this app's only supported default country code today.
 */
function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) {
    return /^[6-9]/.test(digits) ? `+91${digits}` : null;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return /^91[6-9]/.test(digits) ? `+${digits}` : null;
  }
  return null;
}

function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

/** The most recent still-usable invite for this group, if any — reused by createSplitGroupInvite() instead of minting a new one every time the dialog opens (spec §8/§13). */
export async function getActiveSplitGroupInvite(groupId: string): Promise<SplitGroupInvite | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("split_group_invites")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toInvite(data) : null;
}

export async function createSplitGroupInvite(
  groupId: string,
  input: { phone?: string; email?: string; forceNew?: boolean } = {}
): Promise<SplitGroupInvite | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: group } = await supabase.from("split_groups").select("household_id").eq("id", groupId).maybeSingle();
  if (!group) return { error: "Split group not found" };

  let phoneNumber: string | null = null;
  if (input.phone?.trim()) {
    phoneNumber = normalizeIndianPhone(input.phone);
    if (!phoneNumber) return { error: "Enter a valid 10-digit mobile number." };
  }
  let email: string | null = null;
  if (input.email?.trim()) {
    email = normalizeEmail(input.email);
    if (!email) return { error: "Enter a valid email address." };
  }

  if (!input.forceNew) {
    const existing = await getActiveSplitGroupInvite(groupId);
    if (existing) {
      // Attach newly-typed contact info to the reused invite instead of
      // silently dropping it — still one invitation, one link (spec §8).
      if ((phoneNumber && phoneNumber !== existing.phoneNumber) || (email && email !== existing.email)) {
        const { data: updated } = await supabase
          .from("split_group_invites")
          .update({ phone_number: phoneNumber ?? existing.phoneNumber, email: email ?? existing.email })
          .eq("id", existing.id)
          .select()
          .single();
        if (updated) return toInvite(updated);
      }
      return existing;
    }
  }

  // Backend rate limiting (spec §13/§20) — independent of the reuse check
  // above, so someone can't bypass it by always passing forceNew.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabase
    .from("split_group_invites")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("invited_by", user.id)
    .gt("created_at", windowStart);
  if ((count ?? 0) >= RATE_LIMIT_MAX_INVITES) {
    return { error: "You're generating invites too quickly — please wait a few minutes and try again." };
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("split_group_invites")
    .insert({
      group_id: groupId,
      household_id: group.household_id,
      invited_by: user.id,
      phone_number: phoneNumber,
      email,
      token,
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error || !data)
    return { error: error?.message ?? "Failed to create invite. Only this group's creator or the household owner can invite." };

  revalidatePath("/household");
  return toInvite(data);
}

export async function revokeSplitGroupInvite(inviteId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("split_group_invites").update({ status: "revoked" }).eq("id", inviteId);
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { ok: true };
}

export interface SplitInvitePreview {
  valid: boolean;
  reason?: "invalid" | "expired" | "revoked" | "already_accepted";
  groupId?: string;
  householdId?: string;
  groupName?: string;
  householdName?: string;
  inviterName?: string;
  alreadyMember?: boolean;
}

/** Safe to call while logged out — backs the public /join/{token} preview. Never returns balances, amounts, or anyone else's data (spec §7). */
export async function getSplitInvitePreview(token: string): Promise<SplitInvitePreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_split_invite_preview", { p_token: token.trim() });
  if (error || !data) return { valid: false, reason: "invalid" };

  return {
    valid: data.valid,
    reason: data.reason,
    groupId: data.group_id,
    householdId: data.household_id,
    groupName: data.group_name,
    householdName: data.household_name,
    inviterName: data.inviter_name,
    alreadyMember: data.already_member,
  };
}

export type AcceptSplitGroupInviteResult = { householdId: string; groupId: string; alreadyMember?: boolean } | { error: string };

export async function acceptSplitGroupInvite(token: string): Promise<AcceptSplitGroupInviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to accept this invite." };

  const { data, error } = await supabase.rpc("accept_split_group_invite", { p_token: token.trim() });
  if (error) return { error: "Something went wrong accepting this invite. Please try again." };

  if (!data?.ok) {
    switch (data?.reason) {
      case "expired":
        return { error: "This invitation has expired." };
      case "revoked":
        return { error: "This invitation is no longer available." };
      case "already_accepted":
        return { error: "This invitation has already been used." };
      case "already_member":
        if (data.household_id && data.group_id) {
          return { householdId: data.household_id, groupId: data.group_id, alreadyMember: true };
        }
        return { error: "You're already a member of this Split group." };
      default:
        return { error: "This invitation link is invalid." };
    }
  }

  if (!data.household_id || !data.group_id) return { error: "Something went wrong accepting this invite. Please try again." };

  revalidatePath("/household");
  return { householdId: data.household_id, groupId: data.group_id };
}

/** Sends the already-generated invite link over SMS — degrades gracefully (spec §11) when no SMS_PROVIDER is configured, which is the default. */
export async function sendSplitInviteSmsAction(
  phoneNumber: string,
  inviteUrl: string,
  splitGroupName: string
): Promise<{ ok: boolean; message: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const normalized = normalizeIndianPhone(phoneNumber);
  if (!normalized) return { error: "Enter a valid 10-digit mobile number." };

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const inviterName = displayName(profile);

  const result = await sendSplitInviteSms({ phoneNumber: normalized, inviteUrl, splitGroupName, inviterName });
  return { ok: result.ok, message: result.message };
}
