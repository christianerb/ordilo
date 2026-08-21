import { toCalendarDate } from "@/lib/calendar";

/**
 * Heuristics that decide which extracted document dates are offered as
 * Familienplaner (calendar) events in the review step — and which of
 * those are pre-checked.
 *
 * The distinction that matters to a family:
 *   - An APPOINTMENT ("Elternabend", "Abflug", "Arzttermin") belongs in
 *     the calendar — you have to BE somewhere.
 *   - A DEADLINE ("Zahlungsfrist", "Kündigungsfrist", "gültig bis") is
 *     work with a due date — it lives on its task, not in the planner.
 *
 * The magic of the review step is that Ordilo pre-selects the right ones
 * ("Da stehen 2 Termine drin — soll ich sie direkt in euren Planer
 * legen?"), so the default has to be trustworthy: appointments on,
 * deadlines off.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Words that mark a date as a deadline or validity boundary — pre-checked
 * OFF. Checked first: "Anmeldefrist für den Ausflug" contains "Ausflug",
 * but it is a Frist, so the deadline word must win over the appointment
 * word.
 */
const DEADLINE_KEYWORDS = [
  "frist",
  "fällig",
  "faellig",
  "zahlung",
  "zahlbar",
  "einzahlung",
  "überweisung",
  "ueberweisung",
  "mahnung",
  "kündigung",
  "kuendigung",
  "abgabe",
  "einreichung",
  "gezahlt",
  "bezahlt",
  "gültig",
  "gueltig",
  "ablauf",
  "verlängerung",
  "verlaengerung",
  "widerspruch",
] as const;

/**
 * Words that mark a date as an appointment — pre-checked ON. Every label
 * without a keyword still defaults to on: a future date in a family
 * document is far more often something to attend than something to file,
 * and an unchecked box is easier to miss than an unwanted planner entry
 * is to delete.
 */
const APPOINTMENT_KEYWORDS = [
  "termin",
  "elternabend",
  "elterngespräch",
  "elterngespraech",
  "abflug",
  "ankunft",
  "arzt",
  "impfung",
  "feier",
  "fest",
  "treffen",
  "einschulung",
  "sprechstunde",
  "geburtstag",
  "ausflug",
  "gespräch",
  "gespraech",
  "untersuchung",
  "kontrolle",
  "vorsorge",
  "veranstaltung",
  "konzert",
  "aufführung",
  "auffuehrung",
  "turnier",
  "wettbewerb",
  "probetraining",
  "schnuppertag",
  "reise",
  "urlaub",
  "flug",
  "abholung",
  "übergabe",
  "uebergabe",
] as const;

function labelIncludes(label: string, keywords: readonly string[]): boolean {
  const normalized = label.toLocaleLowerCase("de");
  return keywords.some((keyword) => normalized.includes(keyword));
}

/** Whether the label describes a deadline rather than an appointment. */
export function isDeadlineLike(label: string): boolean {
  return labelIncludes(label, DEADLINE_KEYWORDS);
}

/** Whether the label describes an appointment ("Elternabend", "Abflug"). */
export function isAppointmentLike(label: string): boolean {
  return labelIncludes(label, APPOINTMENT_KEYWORDS);
}

/**
 * A document date that can become a Familienplaner event: index into the
 * analysis' `dates` array, ISO date, label, and the pre-selection default.
 */
export interface CalendarCandidate {
  /** Index into the `dates` array this candidate was derived from. */
  index: number;
  /** ISO date "YYYY-MM-DD". */
  date: string;
  /** What the date means ("Elternabend Kita") — becomes the event title. */
  label: string;
  /** Whether the planner toggle starts checked (appointments) or not (deadlines). */
  defaultSelected: boolean;
}

/**
 * Find the extracted dates worth offering as planner events.
 *
 * A date is offered when it is a real ISO calendar date (pure times like
 * "19:25" are not) and lies today or in the future — a "Gezahlt am …"
 * from last month is information, not something to plan.
 *
 * @param dates - The analysis' dates (edited values applied).
 * @param today - ISO date override for tests; defaults to the local today.
 */
export function findCalendarCandidates(
  dates: { date: string; label: string }[],
  today: string = toCalendarDate(new Date()),
): CalendarCandidate[] {
  const candidates: CalendarCandidate[] = [];
  dates.forEach((entry, index) => {
    if (!ISO_DATE_PATTERN.test(entry.date)) return;
    if (entry.date < today) return;
    candidates.push({
      index,
      date: entry.date,
      label: entry.label,
      defaultSelected: !isDeadlineLike(entry.label),
    });
  });
  return candidates;
}

/**
 * The events to create on confirm: candidates whose selection (user
 * override or default) is on.
 */
export function selectedCalendarEvents(
  candidates: CalendarCandidate[],
  overrides: ReadonlyMap<number, boolean>,
): { date: string; label: string }[] {
  return candidates
    .filter(
      (candidate) =>
        overrides.get(candidate.index) ?? candidate.defaultSelected,
    )
    .map((candidate) => ({ date: candidate.date, label: candidate.label }));
}
