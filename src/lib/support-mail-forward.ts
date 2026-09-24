import type { Resend } from "resend";

const DEFAULT_SUPPORT_LOCAL_PARTS = ["info", "hallo"];

function normalizeDomain(domain: string | undefined): string | null {
  const value = domain?.trim().toLowerCase().replace(/^@/, "");
  return value ? value : null;
}

function addressParts(value: string): { local: string; domain: string } | null {
  const match = value.trim().toLowerCase().match(/<?([^<>\s@]+)@([^<>\s@]+)>?$/);
  return match ? { local: match[1], domain: match[2] } : null;
}

/**
 * The public addresses (info@, hallo@ …) that should reach a person. They are
 * deployment configuration, never family aliases, so a family alias can never
 * be mistaken for support mail.
 */
export function supportLocalParts(configured: string | undefined): string[] {
  const parts = (configured ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : DEFAULT_SUPPORT_LOCAL_PARTS;
}

/** The first support address among the recipients, e.g. "info@ordilo.de". */
export function matchSupportAddress(
  recipients: readonly string[],
  inboundDomain: string | undefined,
  localParts: readonly string[],
): string | null {
  const domain = normalizeDomain(inboundDomain);
  if (!domain) return null;
  for (const recipient of recipients) {
    const parts = addressParts(recipient);
    if (parts && parts.domain === domain && localParts.includes(parts.local)) {
      return `${parts.local}@${domain}`;
    }
  }
  return null;
}

/** "Anna Berger <anna@example.com>" → "Anna Berger"; a bare address stays as it is. */
export function senderDisplayName(from: string): string {
  const named = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  const name = (named?.[1] ?? from).replace(/["<>\\\r\n]/g, "").trim();
  return name || "Unbekannt";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SupportForwardResult =
  | { forwarded: true; id: string }
  | { forwarded: false; reason: "loop" };

/**
 * Forward one received support email to the operator's own inbox. The
 * original sender becomes Reply-To, so answering in the mail client goes back
 * to them; the From line has to stay on the verified Ordilo domain.
 */
export async function forwardSupportEmail(params: {
  resend: Resend;
  emailId: string;
  supportAddress: string;
  forwardTo: string;
  inboundDomain: string;
}): Promise<SupportForwardResult> {
  const domain = normalizeDomain(params.inboundDomain);
  const target = addressParts(params.forwardTo);
  // A target on the receiving domain would come straight back through this
  // webhook and forward itself forever.
  if (!target || target.domain === domain) return { forwarded: false, reason: "loop" };

  const { data: received, error } = await params.resend.emails.receiving.get(params.emailId);
  if (error) throw error;
  if (!received) throw new Error("Received email could not be loaded.");

  const sender = addressParts(received.from);
  if (sender?.domain === domain) return { forwarded: false, reason: "loop" };

  const { data: list, error: listError } = await params.resend.emails.receiving.attachments.list({
    emailId: params.emailId,
  });
  if (listError || !list) throw new Error("Resend attachments could not be loaded.");

  const replyTo = received.reply_to?.[0] ?? received.from;
  const note = `Weitergeleitet von ${params.supportAddress} · Absender: ${received.from}`;
  const text = `${note}\n\n${received.text ?? ""}`.trimEnd();
  const html = received.html
    ? `<p style="margin:0 0 16px;color:#625D54;font-size:12px">${escapeHtml(note)}</p>${received.html}`
    : undefined;

  const { data: sent, error: sendError } = await params.resend.emails.send(
    {
      // Quoted, because a comma or other special character in a bare display
      // name would split the From header into several mailboxes.
      from: `"${senderDisplayName(received.from)} über Ordilo" <${params.supportAddress}>`,
      to: params.forwardTo,
      replyTo,
      subject: received.subject || "(ohne Betreff)",
      text,
      ...(html ? { html } : {}),
      ...(list.data.length > 0
        ? {
            attachments: list.data.map((attachment) => ({
              filename: attachment.filename ?? "Anhang",
              path: attachment.download_url,
              contentType: attachment.content_type,
            })),
          }
        : {}),
    },
    // Resend retries webhooks; the key makes a retry send the same mail once.
    { idempotencyKey: `support-forward/${params.emailId}` },
  );
  if (sendError) throw sendError;
  if (!sent) throw new Error("Forwarded email could not be sent.");
  return { forwarded: true, id: sent.id };
}
