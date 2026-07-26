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
    (a) => `${a.amount.trim()}|${a.currency.trim().toLocaleUpperCase("de")}`,
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
