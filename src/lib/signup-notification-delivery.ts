import { createClient as createAdminClient } from "@/lib/supabase/admin";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const SIGNUP_NOTIFICATION_RECIPIENT = "christian.gh.erb@gmail.com";

export type SignupNotificationDeliveryStatus =
  | "sent"
  | "already_handled"
  | "not_configured"
  | "retry_later";

/**
 * Deliver the one-time operator notification for a newly verified account.
 * A trigger creates the record with the auth user, then this function claims
 * it before sending so OTP and magic-link flows cannot send duplicates.
 */
export async function deliverSignupNotification(
  userId: string,
): Promise<SignupNotificationDeliveryStatus> {
  const admin = createAdminClient();
  const { data: notification } = await admin
    .from("signup_notifications")
    .update({ email_claimed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("email_sent_at", null)
    .is("email_claimed_at", null)
    .select("user_id, email")
    .maybeSingle();

  if (!notification) return "already_handled";

  const releaseClaim = async () => {
    await admin
      .from("signup_notifications")
      .update({ email_claimed_at: null })
      .eq("user_id", userId);
  };

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await releaseClaim();
    return "not_configured";
  }

  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM_EMAIL ?? "Ordilo <onboarding@resend.dev>",
      to: SIGNUP_NOTIFICATION_RECIPIENT,
      subject: "Neue Anmeldung bei Ordilo",
      text: `Neue Person bei Ordilo: ${notification.email}`,
      html: `<p>Neue Person bei Ordilo: <strong>${escapeHtml(notification.email)}</strong></p>`,
    }),
  }).catch(() => null);

  if (!response?.ok) {
    await releaseClaim();
    return "retry_later";
  }

  await admin
    .from("signup_notifications")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("user_id", userId);
  return "sent";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}
