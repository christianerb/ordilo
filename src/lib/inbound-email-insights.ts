import type { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractEmailSuggestions } from "@/lib/ai/inbound-email-insights";
import { plainTextFromEmail } from "@/lib/inbound-email-text";
import type { EmailSuggestion } from "@/lib/schemas/inbound-email";
import type { Database } from "@/types/database";

/**
 * Turns a plain forwarded email into questions the family can answer with one
 * tap: "Soll ich daraus einen Termin machen?"
 *
 * A copy of the email is stored only when there is something to propose, so
 * a newsletter leaves no trace at all. What is stored is then the family's to
 * keep or to erase — the app asks them, and `decide_inbound_email_retention`
 * carries out the answer.
 */

/** Today as YYYY-MM-DD in the family's timezone (Germany). */
export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Maps a model proposal onto its `inbound_suggestions` row. */
export function toSuggestionRow(
  suggestion: EmailSuggestion,
  context: { familyId: string; inboundEmailId: string },
) {
  const isEvent = suggestion.kind === "calendar_event";
  return {
    family_id: context.familyId,
    inbound_email_id: context.inboundEmailId,
    kind: suggestion.kind,
    title: suggestion.title,
    starts_on: suggestion.date,
    // Times only ever belong to an appointment; a task carries a due date.
    starts_time: isEvent ? suggestion.start_time : null,
    ends_time: isEvent ? suggestion.end_time : null,
    location: isEvent ? suggestion.location : null,
    note: suggestion.note,
    confidence: suggestion.confidence,
  };
}

export interface RecordInsightsResult {
  suggestionCount: number;
}

export async function recordInboundEmailInsights(params: {
  emailId: string;
  familyId: string;
  resend: Resend;
  /** Created by the inbound API route, the only service-role boundary. */
  admin: SupabaseClient<Database>;
}): Promise<RecordInsightsResult> {
  const { admin } = params;

  // The unique index on source_email_id is the real guard; this check keeps a
  // Resend retry from paying for a second model call.
  const { data: existing } = await admin
    .from("inbound_emails")
    .select("id")
    .eq("source_email_id", params.emailId)
    .maybeSingle();
  if (existing) return { suggestionCount: 0 };

  const { data: received, error } = await params.resend.emails.receiving.get(
    params.emailId,
  );
  if (error || !received) return { suggestionCount: 0 };

  const bodyText = plainTextFromEmail(received.text, received.html);
  if (!bodyText) return { suggestionCount: 0 };

  const { data: memberRows } = await admin
    .from("family_members")
    .select("name")
    .eq("family_id", params.familyId);

  const suggestions = await extractEmailSuggestions({
    subject: received.subject ?? "",
    from: received.from,
    bodyText,
    today: berlinToday(),
    memberNames: (memberRows ?? []).map((member) => member.name),
  });
  if (suggestions.length === 0) return { suggestionCount: 0 };

  const { data: emailRow, error: emailError } = await admin
    .from("inbound_emails")
    .insert({
      family_id: params.familyId,
      source_email_id: params.emailId,
      from_address: received.from,
      subject: received.subject ?? "",
      body_text: bodyText,
      received_at: received.created_at ?? new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (emailError || !emailRow) return { suggestionCount: 0 };

  const { error: suggestionError } = await admin
    .from("inbound_suggestions")
    .insert(
      suggestions.map((suggestion) =>
        toSuggestionRow(suggestion, {
          familyId: params.familyId,
          inboundEmailId: emailRow.id,
        }),
      ),
    );
  if (suggestionError) {
    // An email row with no questions attached would leave a stored copy
    // nobody can ever decide about.
    await admin.from("inbound_emails").delete().eq("id", emailRow.id);
    return { suggestionCount: 0 };
  }

  return { suggestionCount: suggestions.length };
}
