import { after } from "next/server";
import { Resend } from "resend";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { inboundAliasCandidates } from "@/lib/family-inbound-email";
import { importInboundEmailAttachments } from "@/lib/inbound-email-import";
import { runPendingJobs } from "@/lib/jobs";
import {
  deliverInboundEmailNotifications,
  queueInboundReceipt,
  resolveInboundNotificationRecipient,
} from "@/lib/inbound-email-notifications";

export const maxDuration = 300;

/**
 * POST /api/email/inbound
 *
 * Resend sends `email.received` events here. Signature verification happens
 * before anything is parsed or written; only a known, private family alias
 * can cause attachments to enter Ordilo.
 */
export async function POST(request: Request): Promise<Response> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN;
  const resendKey = process.env.RESEND_API_KEY;
  if (!webhookSecret || !inboundDomain || !resendKey) {
    return Response.json({ error: "E-Mail-Eingang ist nicht eingerichtet." }, { status: 503 });
  }

  const payload = await request.text();
  const resend = new Resend(resendKey);
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch {
    return Response.json({ error: "Ungültige Webhook-Signatur." }, { status: 401 });
  }

  if (event.type !== "email.received") return Response.json({ ok: true });

  const recipients = [...event.data.to, ...event.data.received_for];
  const aliases = inboundAliasCandidates(recipients, inboundDomain);
  if (aliases.length === 0) return Response.json({ ok: true, ignored: true });

  const admin = createAdminClient();
  const { data: alias } = await admin
    .from("family_email_aliases")
    .select("family_id")
    .in("local_part", aliases)
    .maybeSingle();
  if (!alias) return Response.json({ ok: true, ignored: true });

  const { data: family } = await admin
    .from("families")
    .select("created_by")
    .eq("id", alias.family_id)
    .maybeSingle();
  if (!family) return Response.json({ ok: true, ignored: true });

  try {
    const notificationRecipient = await resolveInboundNotificationRecipient({
      familyId: alias.family_id,
      ownerId: family.created_by,
      sender: event.data.from,
    });
    const imported = await importInboundEmailAttachments({
      emailId: event.data.email_id,
      familyId: alias.family_id,
      uploadedBy: family.created_by,
      notificationRecipient,
      resend,
    });

    if (imported.importedDocumentIds.length > 0) {
      after(async () => {
        const appUrl = process.env.APP_BASE_URL ?? new URL(request.url).origin;
        await queueInboundReceipt({
          familyId: alias.family_id,
          sourceEmailId: event.data.email_id,
          recipientEmail: notificationRecipient,
          documentCount: imported.importedDocumentIds.length,
        });
        for (let round = 0; round < 5; round++) {
          const summary = await runPendingJobs(admin, 3);
          if (summary.claimed === 0) break;
        }
        await deliverInboundEmailNotifications(appUrl);
      });
    }

    return Response.json({ ok: true, imported: imported.importedDocumentIds.length });
  } catch {
    // Return a retryable status. The unique source attachment index prevents
    // a Resend retry from creating a second document.
    return Response.json({ error: "E-Mail-Anhänge konnten nicht verarbeitet werden." }, { status: 500 });
  }
}
