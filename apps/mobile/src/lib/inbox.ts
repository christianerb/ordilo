import { formatGermanDate } from "./calendar";
import { getSupabase } from "./supabase";

/**
 * The Posteingang inbox: emails a family forwarded to their Ordilo address
 * and what became of them. Read through direct RLS-scoped queries — the
 * tables carry family-select policies (see migration 0067), and no API
 * route exists for this list.
 */

export type InboxEmailStatus = "new_suggestions" | "in_library" | "filed";

export interface InboxEmail {
  id: string;
  subject: string;
  fromAddress: string;
  receivedAt: string;
  /** Suggestions Ordilo made from this email that nobody has answered yet. */
  pendingSuggestions: number;
  /** The document this email turned into, once it reached the library. */
  documentId: string | null;
  status: InboxEmailStatus;
}

export const INBOX_STATUS_LABELS: Record<InboxEmailStatus, string> = {
  new_suggestions: "Neue Vorschläge",
  in_library: "In der Ablage",
  filed: "Abgelegt",
};

const INBOX_LIMIT = 30;
const FRIENDLY_ERROR =
  "Die eingegangene Post konnte nicht geladen werden. Bitte versuch es nochmal.";

interface InboxEmailRow {
  id: string;
  source_email_id: string;
  from_address: string;
  subject: string;
  received_at: string;
}

/**
 * One small status per email. A question nobody has answered yet beats
 * everything else — same ordering rule as the intake banner.
 */
export function deriveInboxStatus(input: {
  pendingSuggestions: number;
  documentId: string | null;
}): InboxEmailStatus {
  if (input.pendingSuggestions > 0) return "new_suggestions";
  if (input.documentId) return "in_library";
  return "filed";
}

/** Relative German time for the inbox list ("vor 2 Stunden", "Gestern"). */
export function formatInboxReceivedAt(receivedAt: string, now = new Date()): string {
  const then = new Date(receivedAt);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Gerade eben";
  if (minutes === 1) return "vor 1 Minute";
  if (minutes < 60) return `vor ${minutes} Minuten`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "vor 1 Stunde";
  if (hours < 24) return `vor ${hours} Stunden`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return formatGermanDate(receivedAt);
}

/**
 * Newest first. Emails the family chose to delete keep no readable copy
 * (subject and sender are erased in the same statement), so they would be
 * empty rows — they stay out of the list entirely.
 */
export async function loadInboxEmails(familyId: string): Promise<InboxEmail[]> {
  const supabase = getSupabase();
  const { data: emailRows, error: emailsError } = await supabase
    .from("inbound_emails")
    .select("id, source_email_id, from_address, subject, received_at")
    .eq("family_id", familyId)
    .neq("retention", "deleted")
    .order("received_at", { ascending: false })
    .limit(INBOX_LIMIT);
  if (emailsError) throw new Error(FRIENDLY_ERROR);

  const emails = (emailRows ?? []) as InboxEmailRow[];
  if (emails.length === 0) return [];

  const emailIds = emails.map((email) => email.id);
  const sourceEmailIds = emails.map((email) => email.source_email_id);
  const [
    { data: suggestionRows, error: suggestionsError },
    { data: documentRows, error: documentsError },
  ] = await Promise.all([
    supabase
      .from("inbound_suggestions")
      .select("inbound_email_id, status")
      .eq("family_id", familyId)
      .in("inbound_email_id", emailIds),
    supabase
      .from("documents")
      .select("id, source_email_id")
      .eq("family_id", familyId)
      .in("source_email_id", sourceEmailIds),
  ]);
  if (suggestionsError || documentsError) throw new Error(FRIENDLY_ERROR);

  const pendingByEmail = new Map<string, number>();
  for (const suggestion of suggestionRows ?? []) {
    if (suggestion.status !== "pending") continue;
    pendingByEmail.set(
      suggestion.inbound_email_id,
      (pendingByEmail.get(suggestion.inbound_email_id) ?? 0) + 1,
    );
  }
  const documentBySourceEmail = new Map<string, string>();
  for (const document of documentRows ?? []) {
    if (document.source_email_id && !documentBySourceEmail.has(document.source_email_id)) {
      documentBySourceEmail.set(document.source_email_id, document.id);
    }
  }

  return emails.map((email) => {
    const pendingSuggestions = pendingByEmail.get(email.id) ?? 0;
    const documentId = documentBySourceEmail.get(email.source_email_id) ?? null;
    return {
      id: email.id,
      subject: email.subject,
      fromAddress: email.from_address,
      receivedAt: email.received_at,
      pendingSuggestions,
      documentId,
      status: deriveInboxStatus({ pendingSuggestions, documentId }),
    };
  });
}
