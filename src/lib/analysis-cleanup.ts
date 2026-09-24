import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import {
  appointmentKeywordsIn,
  isDeadlineLike,
  isDocumentIssueDate,
} from "@/lib/calendar-heuristics";

/**
 * Display- and storage-level cleanup for extracted dates and amounts.
 *
 * The extraction sometimes reports the same value several times (a due
 * date mentioned in three places of a letter) and emits generic labels
 * that merely restate the field type ("Datum" under a date, "Betrag"
 * under an amount). This module removes both kinds of noise:
 *
 *   - `meaningfulLabel` filters out empty/generic labels.
 *   - `dedupeDates` / `dedupeAmounts` collapse repeated values while
 *     keeping entries whose labels genuinely differ (the same 88,00 EUR
 *     as "Gesamtbetrag" and as "Noch offen" stays two rows).
 *   - `attachTimesToDates` folds a bare time ("08:15") into its date.
 *   - `dropTasksDuplicatingAppointments` removes a task that only repeats
 *     an appointment, and `dropDocumentDateEvents` keeps the letter's own
 *     date out of the planner.
 *
 * Used by the analyze pipeline (clean before storing), the confirm route
 * (clean legacy payloads), and the confirmed-details view (clean data
 * stored before this cleanup existed).
 */

/** Labels that restate the field type instead of describing the value. */
export const GENERIC_DATE_LABELS: ReadonlySet<string> = new Set([
  "datum",
  "date",
  "termin",
]);
export const GENERIC_AMOUNT_LABELS: ReadonlySet<string> = new Set([
  "betrag",
  "beträge",
  "summe",
  "amount",
  "geldbetrag",
]);

/**
 * Return the trimmed label when it carries information, or null when it
 * is empty or merely generic ("Datum", "Betrag", …).
 */
export function meaningfulLabel(
  label: string | null | undefined,
  generic: ReadonlySet<string>,
): string | null {
  const trimmed = (label ?? "").trim();
  if (!trimmed || generic.has(trimmed.toLocaleLowerCase("de"))) return null;
  return trimmed;
}

/**
 * Collapse entries that repeat the same value without adding information.
 *
 * Rules, per value key:
 *   - Entries with distinct meaningful labels are all kept (they say
 *     different things about the same value).
 *   - An unlabeled/generic duplicate of an already-kept value is dropped.
 *   - When a labeled entry follows an unlabeled one for the same value,
 *     the label is adopted instead of adding a second row.
 */
function dedupeEntries<T>(
  entries: readonly T[],
  keyOf: (entry: T) => string,
  labelOf: (entry: T) => string | null,
  withLabel: (entry: T, label: string) => T,
): T[] {
  const kept: T[] = [];
  const byKey = new Map<string, number[]>();

  for (const entry of entries) {
    const key = keyOf(entry);
    const label = labelOf(entry);
    const indices = byKey.get(key);

    if (!indices) {
      byKey.set(key, [kept.length]);
      kept.push(entry);
      continue;
    }

    if (label === null) continue; // generic duplicate of a kept value

    if (indices.some((i) => labelOf(kept[i]) === label)) continue;

    const unlabeled = indices.find((i) => labelOf(kept[i]) === null);
    if (unlabeled !== undefined) {
      kept[unlabeled] = withLabel(kept[unlabeled], label);
    } else {
      indices.push(kept.length);
      kept.push(entry);
    }
  }

  return kept;
}

export function dedupeDates(
  dates: DocumentAnalysis["dates"],
): DocumentAnalysis["dates"] {
  return dedupeEntries(
    dates,
    (d) => d.date.trim(),
    (d) => meaningfulLabel(d.label, GENERIC_DATE_LABELS),
    (d, label) => ({ ...d, label }),
  );
}

export function dedupeAmounts(
  amounts: DocumentAnalysis["amounts"],
): DocumentAnalysis["amounts"] {
  return dedupeEntries(
    amounts,
    // kind and value_date belong to the identity: two 50,00 EUR instalments
    // both labelled "Rate" but paid on different dates are different
    // transactions. Keying on value and currency alone collapsed them and
    // permanently lost a payment before it was ever stored.
    (a) =>
      [
        a.amount.trim(),
        a.currency.trim().toLocaleUpperCase("de"),
        a.kind,
        a.value_date ?? "",
      ].join("|"),
    (a) => meaningfulLabel(a.label, GENERIC_AMOUNT_LABELS),
    (a, label) => ({ ...a, label }),
  );
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// "12.07" alone is more likely a date than a time, so a dot only counts
// with "Uhr" after it.
const TIME_ONLY_PATTERN = /^\s*(\d{1,2})(?::(\d{2})\s*(?:uhr)?|\.(\d{2})\s*uhr)\s*$/i;
const TIME_IN_TEXT_PATTERN = /\b(\d{1,2})[:.](\d{2})\b/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/;

/** Words too general to link a time to its date ("Uhr", "geplant"). */
const TIME_LABEL_STOPWORDS: ReadonlySet<string> = new Set([
  "uhr",
  "uhrzeit",
  "zeit",
  "geplant",
  "voraussichtlich",
  "planmäßig",
  "datum",
  "termin",
]);

function labelTokens(label: string): string[] {
  return label
    .toLocaleLowerCase("de")
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length >= 4 && !TIME_LABEL_STOPWORDS.has(token));
}

function normalizeTime(hours: string, minutes: string): string | null {
  const h = Number(hours);
  const m = Number(minutes);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${minutes}`;
}

/**
 * A date entry that carries only a time of day ("08:15", or type "time"
 * without a calendar date). Returns the normalized "HH:MM", "" when the
 * entry is time-only but unreadable, or null for a regular date.
 */
function timeOnlyValue(entry: { date: string; type: string }): string | null {
  const value = entry.date.trim();
  const match = TIME_ONLY_PATTERN.exec(value);
  if (match) return normalizeTime(match[1], match[2] ?? match[3]) ?? "";
  if (entry.type.trim().toLowerCase() !== "time") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const inText = TIME_IN_TEXT_PATTERN.exec(value);
  return inText ? (normalizeTime(inText[1], inText[2]) ?? "") : "";
}

function labelMentionsTime(label: string, time: string): boolean {
  const [hours, minutes] = time.split(":");
  const pattern = new RegExp(`\\b0?${Number(hours)}[:.]${minutes}\\b`);
  return pattern.test(label);
}

/**
 * A time without a date cannot be planned or shown on a day ("Abfahrt
 * 08:15" alone). Fold each time-only entry into the date it belongs to:
 * the date whose label shares a word with the time's label, otherwise the
 * only date of the document; when neither exists the time is dropped.
 * The time lands in the date's label ("Klassenfahrt · Abfahrt 08:15 Uhr"),
 * which is also the planner event's title.
 */
export function attachTimesToDates(
  dates: DocumentAnalysis["dates"],
): DocumentAnalysis["dates"] {
  const result = dates.map((entry) => ({ ...entry }));
  const times: { time: string; label: string }[] = [];
  const kept: typeof result = [];
  for (const entry of result) {
    const time = timeOnlyValue(entry);
    if (time === null) {
      const dateTime = DATE_TIME_PATTERN.exec(entry.date.trim());
      if (dateTime) {
        entry.date = dateTime[1];
        const clock = normalizeTime(dateTime[2], dateTime[3]);
        // A midnight timestamp is how serializers write "no time".
        if (clock && clock !== "00:00") appendTime(entry, clock, "");
      }
      kept.push(entry);
    } else if (time) {
      times.push({ time, label: entry.label.trim() });
    }
  }

  const isoDates = kept.filter(
    (entry) => ISO_DATE_PATTERN.test(entry.date.trim()) && !isDocumentIssueDate(entry),
  );
  for (const { time, label } of times) {
    const tokens = labelTokens(label);
    // The most specific label wins: "Abfahrt Klassenfahrt" belongs to
    // "Abfahrt Klassenfahrt", not to an earlier "Rückkehr Klassenfahrt".
    let best: (typeof isoDates)[number] | undefined;
    let bestScore = 0;
    for (const entry of isoDates) {
      const dateTokens = labelTokens(entry.label);
      const score = tokens.reduce((sum, token) => {
        if (dateTokens.includes(token)) return sum + 2;
        return dateTokens.some((dateToken) => dateToken.includes(token) || token.includes(dateToken))
          ? sum + 1
          : sum;
      }, 0);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    const target = best ?? (isoDates.length === 1 ? isoDates[0] : undefined);
    if (target) appendTime(target, time, label);
  }
  return kept;
}

function appendTime(
  target: { label: string },
  time: string,
  timeLabel: string,
): void {
  if (labelMentionsTime(target.label, time)) return;
  const currentLabel = meaningfulLabel(target.label, GENERIC_DATE_LABELS) ?? "";
  const current = currentLabel.toLocaleLowerCase("de");
  // Only the words the date's label does not already say: "Klassenfahrt"
  // plus "Abfahrt Klassenfahrt" becomes "Klassenfahrt · Abfahrt 08:15 Uhr".
  const newWords = (meaningfulLabel(timeLabel, GENERIC_DATE_LABELS) ?? "")
    .split(/\s+/)
    .filter((word) => word && !current.includes(word.toLocaleLowerCase("de")));
  const suffix = [...newWords, `${time} Uhr`].join(" ");
  target.label = currentLabel ? `${currentLabel} · ${suffix}` : suffix;
}

/**
 * Words that add nothing to an appointment's name: attending it, articles,
 * prepositions and times of day. Mirrored in apps/mobile document-review.ts.
 */
const APPOINTMENT_FILLER_WORDS = new Set([
  "besuchen", "besuch", "teilnehmen", "teilnahme", "hingehen", "gehen", "wahrnehmen", "dabei", "sein",
  "findet", "statt", "stattfinden", "beginnt", "beginn", "termin", "uhr", "datum",
  "am", "um", "ab", "bis", "zum", "zur", "im", "in", "an", "auf", "bei", "mit", "von", "für", "und",
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem",
  "heute", "morgen", "vormittag", "mittag", "nachmittag", "abend", "nächste", "nächsten", "woche",
]);

/**
 * True when every word of the title is an appointment word or filler, so
 * the task asks for nothing beyond showing up. Deciding by what is left
 * over — rather than by a list of action verbs — keeps any task that says
 * more ("Fotos beim Schulfest machen"). Other words of the date's label
 * do not count: "Anmeldung zum Elternabend" carries the action itself.
 */
export function onlyRestatesAppointment(title: string, appointmentWords: readonly string[]): boolean {
  return title
    .toLocaleLowerCase("de")
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .every((word) => APPOINTMENT_FILLER_WORDS.has(word) || appointmentWords.includes(word));
}

/**
 * Remove tasks that only repeat an appointment already extracted as a
 * date: same due date, the task names the appointment ("Elternabend") and
 * says nothing else. "Anmeldung zum Elternabend" stays — that is work —
 * and so does anything on another day.
 */
export function dropTasksDuplicatingAppointments<
  T extends { title: string; due_date: string | null },
>(
  tasks: readonly T[],
  dates: readonly { date: string; label: string; type?: string }[],
): T[] {
  const appointments = dates.flatMap((entry) => {
    const date = entry.date.trim();
    if (!ISO_DATE_PATTERN.test(date)) return [];
    if (isDocumentIssueDate(entry) || isDeadlineLike(entry.label)) return [];
    const keywords = appointmentKeywordsIn(entry.label);
    // The label's own appointment words ("elternabend", "schulfest"): a
    // title word must be one of them exactly, so "Reisepass" is not "Reise".
    const words = entry.label
      .toLocaleLowerCase("de")
      .split(/[^\p{L}]+/u)
      .filter((word) => keywords.some((keyword) => word.includes(keyword)));
    return keywords.length > 0 ? [{ date, keywords, words }] : [];
  });
  if (appointments.length === 0) return [...tasks];

  return tasks.filter((task) => {
    const due = toIsoDateOrNull(task.due_date);
    if (!due) return true;
    const title = task.title.toLocaleLowerCase("de");
    return !appointments.some(
      (appointment) =>
        appointment.date === due &&
        appointment.keywords.some((keyword) => title.includes(keyword)) &&
        onlyRestatesAppointment(task.title, appointment.words),
    );
  });
}

/**
 * Remove planner events that would be the document's own date: an event
 * labelled like one ("Briefdatum"), or an event on a day whose only
 * extracted date is the issue date — a client may have replaced an empty
 * label with the document title, so the label alone cannot be trusted.
 */
export function dropDocumentDateEvents<T extends { date: string; label: string }>(
  events: readonly T[],
  dates: readonly { date: string; label: string; type?: string }[],
): T[] {
  const issueOnlyDays = new Set<string>();
  const otherDays = new Set<string>();
  for (const entry of dates) {
    const day = toIsoDateOrNull(entry.date);
    if (!day) continue;
    (isDocumentIssueDate(entry) ? issueOnlyDays : otherDays).add(day);
  }
  for (const day of otherDays) issueOnlyDays.delete(day);

  return events.filter((event) => {
    const day = toIsoDateOrNull(event.date);
    if (day && issueOnlyDays.has(day)) return false;
    return !isDocumentIssueDate({ label: event.label });
  });
}

/**
 * Give the document's own date a label that survives storage: stored
 * entities keep the label but not the type, so a "document_date" (or
 * "issue_date", "letter_date") with a generic or empty label would
 * otherwise look like any other date.
 */
export function labelDocumentDates(
  dates: DocumentAnalysis["dates"],
): DocumentAnalysis["dates"] {
  return dates.map((entry) =>
    isDocumentIssueDate({ type: entry.type }) &&
    !meaningfulLabel(entry.label, GENERIC_DATE_LABELS)
      ? { ...entry, label: "Briefdatum" }
      : entry,
  );
}

/**
 * Apply all entity cleanups to an analysis (returns a new object; the
 * input is not mutated). Generic labels are cleared to "" so downstream
 * consumers never see a label that restates the field type.
 */
export function cleanupAnalysisEntities(
  analysis: DocumentAnalysis,
): DocumentAnalysis {
  const dates = dedupeDates(
    labelDocumentDates(attachTimesToDates(analysis.dates)),
  ).map((d) => ({
    ...d,
    label: meaningfulLabel(d.label, GENERIC_DATE_LABELS) ?? "",
  }));
  return {
    ...analysis,
    dates,
    amounts: dedupeAmounts(analysis.amounts).map((a) => ({
      ...a,
      label: meaningfulLabel(a.label, GENERIC_AMOUNT_LABELS) ?? "",
    })),
    tasks: dropTasksDuplicatingAppointments(analysis.tasks, dates),
  };
}

// ---------------------------------------------------------------------------
// German amount parsing
// ---------------------------------------------------------------------------

/**
 * Parse a German-formatted amount into minor units (cents).
 *
 * Amounts arrive as display strings ("1.234,56", "88,00 EUR", "5"), which
 * cannot be summed or compared. Storing minor units as an integer makes
 * "wie viel habe ich insgesamt gezahlt?" a real query instead of the LLM
 * adding numbers it read out of an OCR excerpt.
 *
 * Handles German (1.234,56) and plain/English (1234.56, 1,234.56) forms by
 * treating the LAST separator as the decimal one when it is followed by
 * exactly two digits. Returns null when nothing numeric can be found.
 */
export function parseAmountToMinor(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // Keep digits and separators; drop currency symbols, spaces, letters.
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const body = cleaned.replace(/-/g, "");

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  let integerPart: string;
  let fractionPart = "";

  // A separator is decimal when one or two digits follow it ("10,5",
  // "88,00"); three digits mean a thousands separator ("1.234", "1,234").
  const digitsAfterSep = lastSep === -1 ? -1 : body.length - lastSep - 1;
  if (digitsAfterSep === 1 || digitsAfterSep === 2) {
    integerPart = body.slice(0, lastSep).replace(/[.,]/g, "");
    fractionPart = body.slice(lastSep + 1);
  } else {
    integerPart = body.replace(/[.,]/g, "");
  }

  if (!integerPart && !fractionPart) return null;
  const minor =
    Number(integerPart || "0") * 100 + Number(fractionPart.padEnd(2, "0") || "0");
  if (!Number.isFinite(minor)) return null;
  return negative ? -minor : minor;
}

/** Format minor units back to German display form ("123456" → "1.234,56"). */
export function formatMinorAsGerman(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const euros = Math.trunc(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const grouped = euros.toLocaleString("de-DE");
  return `${negative ? "-" : ""}${grouped},${cents}`;
}

// ---------------------------------------------------------------------------
// Date sanitising
// ---------------------------------------------------------------------------

/**
 * Coerce an LLM-provided date into ISO `YYYY-MM-DD`, or null when it cannot
 * be understood ("Montag", "nächste Woche", "").
 *
 * Postgres `date` columns reject anything else, so an unsanitised value
 * aborts the whole confirm transaction and the user just sees
 * CONFIRM_RPC_FAILED. The analyze path always sanitised; the confirm path
 * passed task due dates straight through, which is why this lives here and
 * is used by both.
 */
export function toIsoDateOrNull(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const raw = value.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // German DD.MM.YYYY, DD.MM.YY or DD.MM. (current year implied)
  const german = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (german) {
    const day = german[1].padStart(2, "0");
    const month = german[2].padStart(2, "0");
    let year = german[3];
    if (!year) {
      year = String(new Date().getFullYear());
    } else if (year.length === 2) {
      year = `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}
