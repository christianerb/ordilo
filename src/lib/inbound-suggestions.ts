import type { InboundSuggestionKind } from "@/lib/schemas/inbound-email";

/**
 * A proposal Ordilo made from a plain inbound email, as the app shows it.
 * Shared by the server component that loads it and the client component
 * that asks the family about it.
 */
export interface InboundSuggestion {
  id: string;
  kind: InboundSuggestionKind;
  title: string;
  /** YYYY-MM-DD, or null for an undated task. */
  starts_on: string | null;
  /** HH:MM:SS as Postgres returns it, or null for an all-day entry. */
  starts_time: string | null;
  ends_time: string | null;
  location: string | null;
  note: string | null;
}

/** One email and everything Ordilo found in it. */
export interface InboundEmailDiscovery {
  /** `inbound_emails.id` — what the retention decision refers to. */
  id: string;
  subject: string;
  fromAddress: string;
  receivedAt: string;
  /** True while the family has not yet said keep-or-delete. */
  retentionPending: boolean;
  suggestions: InboundSuggestion[];
}

const WEEKDAY_DATE = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Postgres hands back `HH:MM:SS`; people read `HH:MM`. */
export function toDisplayTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * The one line under a proposal's title that answers "wann?" — a weekday so
 * the date is graspable without counting, plus the time when there is one.
 *
 * Built from the plain date string (never a `Date`), so a timezone can never
 * shift an appointment onto the day before.
 */
export function formatSuggestionWhen(suggestion: InboundSuggestion): string {
  const time = toDisplayTime(suggestion.starts_time);
  if (!suggestion.starts_on) {
    return suggestion.kind === "task" ? "Ohne Frist" : "Ohne Datum";
  }

  const [year, month, day] = suggestion.starts_on.split("-").map(Number);
  const dateLabel =
    year && month && day
      // Noon keeps the weekday correct regardless of the reader's offset.
      ? WEEKDAY_DATE.format(new Date(year, month - 1, day, 12))
      : suggestion.starts_on;

  const endTime = toDisplayTime(suggestion.ends_time);
  if (!time) return dateLabel;
  return endTime && endTime !== time
    ? `${dateLabel}, ${time}–${endTime} Uhr`
    : `${dateLabel}, ${time} Uhr`;
}

/** "Termin" / "Aufgabe" — what accepting the proposal will create. */
export function suggestionKindLabel(kind: InboundSuggestionKind): string {
  return kind === "calendar_event" ? "Termin" : "Aufgabe";
}

/** The button that says exactly what the tap does. */
export function suggestionAcceptLabel(kind: InboundSuggestionKind): string {
  return kind === "calendar_event" ? "In den Kalender" : "Auf die Liste";
}

/**
 * The display name of a sender: "Kita Sonnenschein" out of
 * `Kita Sonnenschein <info@kita.de>`, or the bare address when there is no
 * name. Falls back to a neutral phrase so the card never shows an empty gap.
 */
export function formatSender(fromAddress: string): string {
  const withName = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(fromAddress);
  const name = withName?.[1]?.trim();
  if (name) return name;
  const address = withName?.[2]?.trim() ?? fromAddress.trim();
  return address || "einer E-Mail";
}

/**
 * The elephant's opening line. It names what was found rather than how many
 * rows are pending, because a family reads "ein Termin", not "1 Vorschlag".
 */
export function discoveryHeadline(
  discoveries: readonly InboundEmailDiscovery[],
): string {
  const open = discoveries.flatMap((discovery) => discovery.suggestions);
  if (open.length === 0) return "Ich habe eine E-Mail gelesen.";
  if (open.length === 1) {
    return open[0].kind === "calendar_event"
      ? "Ich habe einen Termin in einer E-Mail gefunden."
      : "Ich habe eine Aufgabe in einer E-Mail gefunden.";
  }
  const allEvents = open.every((item) => item.kind === "calendar_event");
  if (allEvents) return `Ich habe ${open.length} Termine in euren E-Mails gefunden.`;
  return `Ich habe ${open.length} Sachen in euren E-Mails gefunden.`;
}
