import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  inviteNotificationHtml,
  inviteNotificationSubject,
  inviteNotificationText,
} from "@/lib/invite-notification";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export type InviteNotificationDeliveryStatus =
  | "sent"
  | "already_handled"
  | "not_configured"
  | "retry_later";

/**
 * Atomically claim and deliver an invite-created notification.
 *
 * The notification row is created in the same transaction as the membership
 * change. This makes delivery safe to retry without tying data consistency to
 * an external email provider.
 */
export async function deliverInviteNotification(
  notificationId: string,
  actorUserId: string,
  appUrl: string,
): Promise<InviteNotificationDeliveryStatus> {
  const admin = createAdminClient();
  const { data: notification } = await admin
    .from("family_invite_notifications")
    .update({ email_claimed_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("actor_user_id", actorUserId)
    .is("email_sent_at", null)
    .is("email_claimed_at", null)
    .select("id, recipient_user_id, family_name, source_family_name")
    .maybeSingle();

  if (!notification) return "already_handled";

  const releaseClaim = async () => {
    await admin
      .from("family_invite_notifications")
      .update({ email_claimed_at: null })
      .eq("id", notification.id);
  };

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await releaseClaim();
    return "not_configured";
  }

  const { data: recipient } = await admin.auth.admin.getUserById(
    notification.recipient_user_id,
  );
  if (!recipient.user?.email) {
    await releaseClaim();
    return "already_handled";
  }

  const email = {
    familyName: notification.family_name,
    sourceFamilyName: notification.source_family_name,
    appUrl,
  };
  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.INVITE_NOTIFICATION_FROM_EMAIL
        ?? process.env.DIGEST_FROM_EMAIL
        ?? "Ordilo <onboarding@resend.dev>",
      to: recipient.user.email,
      subject: inviteNotificationSubject(email),
      html: inviteNotificationHtml(email),
      text: inviteNotificationText(email),
    }),
  }).catch(() => null);

  if (!response?.ok) {
    await releaseClaim();
    return "retry_later";
  }

  await admin
    .from("family_invite_notifications")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", notification.id);
  return "sent";
}
