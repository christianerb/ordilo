import type { DocumentAnalysis } from "@/lib/schemas/extraction";

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

/**
 * Apply all entity cleanups to an analysis (returns a new object; the
 * input is not mutated). Generic labels are cleared to "" so downstream
 * consumers never see a label that restates the field type.
 */
export function cleanupAnalysisEntities(
  analysis: DocumentAnalysis,
): DocumentAnalysis {
  return {
    ...analysis,
    dates: dedupeDates(analysis.dates).map((d) => ({
      ...d,
      label: meaningfulLabel(d.label, GENERIC_DATE_LABELS) ?? "",
    })),
    amounts: dedupeAmounts(analysis.amounts).map((a) => ({
      ...a,
      label: meaningfulLabel(a.label, GENERIC_AMOUNT_LABELS) ?? "",
    })),
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
