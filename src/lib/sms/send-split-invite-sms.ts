export interface SendSplitInviteSmsInput {
  phoneNumber: string;
  inviteUrl: string;
  splitGroupName: string;
  inviterName: string;
}

export interface SendSplitInviteSmsResult {
  ok: boolean;
  /** false when no provider is wired in at all — the normal state today. */
  configured: boolean;
  message: string;
}

/**
 * SMS delivery abstraction for Let's Split invites — deliberately
 * provider-agnostic. The invitation itself (the token, the URL, who it's
 * for) is always generated first by src/lib/actions/split-invites.ts; this
 * function only ever delivers an already-generated inviteUrl, never mints
 * one of its own. That split is what lets a real provider (MSG91, Jio,
 * Exotel — whichever completes India DLT/PE-TM registration first) get
 * wired in later by rewriting only the body of this one function, without
 * touching invitation generation, storage, or acceptance at all.
 *
 * No SMS_PROVIDER is configured today, and none is required — Copy Link,
 * WhatsApp, and Email all work independently of this function.
 */
export async function sendSplitInviteSms(input: SendSplitInviteSmsInput): Promise<SendSplitInviteSmsResult> {
  const provider = process.env.SMS_PROVIDER;

  if (!provider) {
    console.info(
      `[sms:dev] Would text ${input.phoneNumber}: "${input.inviterName} invited you to join \"${input.splitGroupName}\" on Home Inventory — ${input.inviteUrl}"`
    );
    return { ok: false, configured: false, message: "SMS provider not configured. Invite link generated successfully." };
  }

  // Not reachable yet — no SMS_PROVIDER value is supported today. Once one
  // completes DLT/KYC registration, its API call goes here (see spec §22):
  //   Home Inventory -> Invite Service (split-invites.ts) -> SMS Service
  //   (this file) -> MSG91 / Jio / Exotel, always using input.inviteUrl as-is.
  return { ok: false, configured: true, message: `SMS provider "${provider}" isn't wired up yet — copy the invite link and share it instead.` };
}
