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

const NOTIFICATION_BATCH_SIZE = 50;
const NOTIFICATION_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

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
  // A crashed serverless invocation must not leave a notification claimed
  // forever. Resend calls below are bounded by its HTTP response, so a
  // ten-minute lease leaves ample room for normal delivery.
  await admin
    .from("family_invite_notifications")
    .update({ email_claimed_at: null })
    .is("email_sent_at", null)
    .lt(
      "email_claimed_at",
      new Date(Date.now() - NOTIFICATION_CLAIM_TIMEOUT_MS).toISOString(),
    );
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

/**
 * Deliver a bounded batch of queued notifications from the scheduler.
 * Rows are still claimed by {@link deliverInviteNotification}, so this is
 * safe alongside immediate client and post-response delivery attempts.
 */
export async function deliverPendingInviteNotifications(
  appUrl: string,
): Promise<{ sent: number; retryLater: number; skipped: number }> {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("family_invite_notifications")
    .select("id, actor_user_id")
    .is("email_sent_at", null)
    .is("email_claimed_at", null)
    .order("created_at", { ascending: true })
    .limit(NOTIFICATION_BATCH_SIZE);

  let sent = 0;
  let retryLater = 0;
  let skipped = 0;
  for (const notification of pending ?? []) {
    const status = await deliverInviteNotification(
      notification.id,
      notification.actor_user_id,
      appUrl,
    );
    if (status === "sent") sent++;
    else if (status === "retry_later" || status === "not_configured") retryLater++;
    else skipped++;
  }
  return { sent, retryLater, skipped };
}
