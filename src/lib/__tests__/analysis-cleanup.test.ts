import { describe, expect, it } from "vitest";
import {
  GENERIC_AMOUNT_LABELS,
  GENERIC_DATE_LABELS,
  cleanupAnalysisEntities,
  dedupeAmounts,
  dedupeDates,
  meaningfulLabel,
} from "@/lib/analysis-cleanup";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

function date(
  value: string,
  label = "",
  overrides: Partial<DocumentAnalysis["dates"][0]> = {},
): DocumentAnalysis["dates"][0] {
  return { date: value, type: "date", label, confidence: 0.9, ...overrides };
}

function amount(
  value: string,
  label = "",
  currency = "EUR",
): DocumentAnalysis["amounts"][0] {
  return { amount: value, currency, label, confidence: 0.9 };
}

describe("meaningfulLabel", () => {
  it("returns null for empty and generic labels", () => {
    expect(meaningfulLabel("", GENERIC_DATE_LABELS)).toBeNull();
    expect(meaningfulLabel("  ", GENERIC_DATE_LABELS)).toBeNull();
    expect(meaningfulLabel("Datum", GENERIC_DATE_LABELS)).toBeNull();
    expect(meaningfulLabel("TERMIN", GENERIC_DATE_LABELS)).toBeNull();
    expect(meaningfulLabel("Betrag", GENERIC_AMOUNT_LABELS)).toBeNull();
    expect(meaningfulLabel("Beträge", GENERIC_AMOUNT_LABELS)).toBeNull();
  });

  it("returns the trimmed label when it carries information", () => {
    expect(meaningfulLabel(" Zahlungsfrist ", GENERIC_DATE_LABELS)).toBe(
      "Zahlungsfrist",
    );
    expect(meaningfulLabel("Bereits gezahlt", GENERIC_AMOUNT_LABELS)).toBe(
      "Bereits gezahlt",
    );
  });
});

describe("dedupeDates", () => {
  it("collapses identical dates with generic labels into one row", () => {
    const result = dedupeDates([
      date("2026-07-24", "Datum"),
      date("2026-07-24", "Datum"),
      date("2026-07-24"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-07-24");
  });

  it("keeps the same date twice when both labels are meaningful and differ", () => {
    const result = dedupeDates([
      date("2026-07-24", "Zahlungsfrist"),
      date("2026-07-24", "Elternabend"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("adopts a later meaningful label instead of adding a duplicate row", () => {
    const result = dedupeDates([
      date("2026-07-24", "Datum"),
      date("2026-07-24", "Zahlungsfrist"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Zahlungsfrist");
  });

  it("drops a repeated meaningful label for the same date", () => {
    const result = dedupeDates([
      date("2026-07-24", "Zahlungsfrist"),
      date("2026-07-24", "Zahlungsfrist"),
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps distinct dates untouched", () => {
    const result = dedupeDates([
      date("2026-07-24", "Zahlungsfrist"),
      date("2026-08-01", "Elternabend"),
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("dedupeAmounts", () => {
  it("collapses the same amount and currency", () => {
    const result = dedupeAmounts([
      amount("88,00", "Betrag"),
      amount("88,00", ""),
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps the same amount in different currencies", () => {
    const result = dedupeAmounts([
      amount("88,00", "", "EUR"),
      amount("88,00", "", "CHF"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("keeps the same amount with different meaningful labels", () => {
    const result = dedupeAmounts([
      amount("88,00", "Gesamtbetrag"),
      amount("88,00", "Noch offen"),
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("cleanupAnalysisEntities", () => {
  const base: DocumentAnalysis = {
    document_type: "letter",
    title: "Test",
    summary: "Test",
    family_members: [],
    organizations: [],
    dates: [
      date("2026-07-24", "Datum"),
      date("2026-07-24", "Datum"),
      date("2026-08-01", "Zahlungsfrist"),
    ],
    amounts: [
      amount("88,00", "Betrag"),
      amount("88,00", ""),
      amount("10,00", "Bereits gezahlt"),
    ],
    tasks: [],
    facts: [],
    suggested_category: "Test",
    tags: [],
    needs_user_review: false,
  };

  it("dedupes and clears generic labels without mutating the input", () => {
    const result = cleanupAnalysisEntities(base);
    expect(result.dates).toHaveLength(2);
    expect(result.dates[0].label).toBe("");
    expect(result.dates[1].label).toBe("Zahlungsfrist");
    expect(result.amounts).toHaveLength(2);
    expect(result.amounts[0].label).toBe("");
    expect(result.amounts[1].label).toBe("Bereits gezahlt");
    // Input untouched.
    expect(base.dates).toHaveLength(3);
    expect(base.dates[0].label).toBe("Datum");
  });

  it("passes through untouched fields", () => {
    const result = cleanupAnalysisEntities(base);
    expect(result.title).toBe("Test");
    expect(result.tasks).toBe(base.tasks);
  });
});
