import { createClient as createAdminClient } from "@/lib/supabase/admin";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

type InboundNotificationKind = "received" | "failed";

export function inboundReceiptEmail(fileCount: number, appUrl: string) {
  const documentLabel = fileCount === 1 ? "ein Dokument" : `${fileCount} Dokumente`;
  return {
    subject: "Dein Dokument ist bei Ordilo angekommen",
    text: `Wir haben ${documentLabel} erhalten und prüfen es jetzt. Du findest es in Ordilo: ${appUrl}/dokumente`,
    html: `<p>Wir haben ${documentLabel} erhalten und prüfen es jetzt.</p><p><a href="${escapeHtml(appUrl)}/dokumente">Dokumente öffnen</a></p>`,
  };
}

export function inboundFailureEmail(appUrl: string) {
  return {
    subject: "Ein Dokument braucht deine Hilfe",
    text: `Ein per E-Mail gesendetes Dokument konnte nicht verarbeitet werden. Du kannst es in Ordilo erneut versuchen: ${appUrl}/dokumente`,
    html: `<p>Ein per E-Mail gesendetes Dokument konnte nicht verarbeitet werden.</p><p><a href="${escapeHtml(appUrl)}/dokumente">Dokumente öffnen und erneut versuchen</a></p>`,
  };
}

/**
 * Resolve a safe notification recipient. Forwarded mail can retain a bank's
 * or school's original From address, so that address is used only when it is
 * registered to a member of this family. Otherwise the family owner receives
 * the notice.
 */
export async function resolveInboundNotificationRecipient(params: {
  familyId: string;
  ownerId: string;
  sender: string;
}): Promise<string | null> {
  const admin = createAdminClient();
  const senderEmail = mailboxAddress(params.sender);
  const { data: memberships } = await admin
    .from("family_memberships")
    .select("user_id")
    .eq("family_id", params.familyId);

  if (senderEmail) {
    for (const membership of memberships ?? []) {
      const { data } = await admin.auth.admin.getUserById(membership.user_id);
      const email = data.user?.email?.toLowerCase();
      if (email === senderEmail) return email;
    }
  }

  const { data } = await admin.auth.admin.getUserById(params.ownerId);
  return data.user?.email?.toLowerCase() ?? null;
}

/** Queue one deduplicated receipt notification for an accepted inbound email. */
export async function queueInboundReceipt(params: {
  familyId: string;
  sourceEmailId: string;
  recipientEmail: string | null;
  documentCount: number;
}) {
  if (!params.recipientEmail || params.documentCount === 0) return;
  const admin = createAdminClient();
  await admin.from("inbound_email_notifications").insert({
    family_id: params.familyId,
    recipient_email: params.recipientEmail,
    kind: "received",
    source_email_id: params.sourceEmailId,
    document_count: params.documentCount,
  });
}

/**
 * Queue notifications for failed inbound documents, then send every pending
 * receipt/failure notification. Claims make concurrent webhook and job-worker
 * invocations safe; failed sends are released for the next worker run.
 */
export async function deliverInboundEmailNotifications(appUrl: string) {
  const admin = createAdminClient();
  const { data: failedDocuments } = await admin
    .from("documents")
    .select("id, family_id, source_email_id, source_email_recipient")
    .eq("status", "failed")
    .not("source_email_id", "is", null)
    .not("source_email_recipient", "is", null)
    .limit(100);

  for (const document of failedDocuments ?? []) {
    await admin.from("inbound_email_notifications").insert({
      family_id: document.family_id,
      recipient_email: document.source_email_recipient!,
      kind: "failed",
      source_email_id: document.source_email_id!,
      document_id: document.id,
    });
  }

  const { data: pending } = await admin
    .from("inbound_email_notifications")
    .select("id, recipient_email, kind, document_count")
    .is("email_claimed_at", null)
    .is("email_sent_at", null)
    .limit(100);

  for (const notification of pending ?? []) {
    const { data: claimed } = await admin
      .from("inbound_email_notifications")
      .update({ email_claimed_at: new Date().toISOString() })
      .eq("id", notification.id)
      .is("email_claimed_at", null)
      .is("email_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const sent = await sendInboundNotification(
      notification.recipient_email,
      notification.kind as InboundNotificationKind,
      notification.document_count,
      appUrl,
    );
    if (sent) {
      await admin
        .from("inbound_email_notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", notification.id);
    } else {
      await admin
        .from("inbound_email_notifications")
        .update({ email_claimed_at: null })
        .eq("id", notification.id);
    }
  }
}

async function sendInboundNotification(
  recipientEmail: string,
  kind: InboundNotificationKind,
  documentCount: number,
  appUrl: string,
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const email =
    kind === "received"
      ? inboundReceiptEmail(documentCount, appUrl)
      : inboundFailureEmail(appUrl);
  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM_EMAIL ?? "Ordilo <onboarding@resend.dev>",
      to: recipientEmail,
      ...email,
    }),
  }).catch(() => null);
  return Boolean(response?.ok);
}

function mailboxAddress(value: string): string | null {
  const match = value.trim().match(/<?([^<>\s@]+@[^<>\s@]+)>?$/);
  return match?.[1].toLowerCase() ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
