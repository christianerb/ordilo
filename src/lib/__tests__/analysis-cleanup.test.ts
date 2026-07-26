import { describe, expect, it } from "vitest";
import {
  GENERIC_AMOUNT_LABELS,
  GENERIC_DATE_LABELS,
  cleanupAnalysisEntities,
  dedupeAmounts,
  dedupeDates,
  formatMinorAsGerman,
  meaningfulLabel,
  parseAmountToMinor,
  toIsoDateOrNull,
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
  overrides: Partial<DocumentAnalysis["amounts"][0]> = {},
): DocumentAnalysis["amounts"][0] {
  return {
    amount: value,
    currency,
    label,
    kind: "other",
    value_date: null,
    confidence: 0.9,
    ...overrides,
  };
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

  it("keeps two identical instalments paid on different dates", () => {
    // Same value, same label, different payment date = two transactions.
    // Collapsing them lost a payment before it was ever stored, and made
    // later date filtering and totals wrong.
    const result = dedupeAmounts([
      amount("50,00", "Rate", "EUR", { kind: "paid", value_date: "2026-06-01" }),
      amount("50,00", "Rate", "EUR", { kind: "paid", value_date: "2026-07-01" }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.value_date)).toEqual([
      "2026-06-01",
      "2026-07-01",
    ]);
  });

  it("keeps the same amount when it means different things", () => {
    // 88,00 as the invoice total and 88,00 as the amount paid are not the
    // same row even without labels.
    const result = dedupeAmounts([
      amount("88,00", "", "EUR", { kind: "total" }),
      amount("88,00", "", "EUR", { kind: "paid" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("still collapses a true duplicate", () => {
    const result = dedupeAmounts([
      amount("50,00", "Rate", "EUR", { kind: "paid", value_date: "2026-06-01" }),
      amount("50,00", "Rate", "EUR", { kind: "paid", value_date: "2026-06-01" }),
    ]);
    expect(result).toHaveLength(1);
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

describe("parseAmountToMinor", () => {
  it("parses German formatting", () => {
    expect(parseAmountToMinor("88,00")).toBe(8800);
    expect(parseAmountToMinor("1.234,56")).toBe(123456);
    expect(parseAmountToMinor("10,5")).toBe(1050);
    expect(parseAmountToMinor("5")).toBe(500);
  });

  it("ignores currency symbols and surrounding text", () => {
    expect(parseAmountToMinor("88,00 EUR")).toBe(8800);
    expect(parseAmountToMinor("€ 1.000,00")).toBe(100000);
    expect(parseAmountToMinor("ca. 12,90 Euro")).toBe(1290);
  });

  it("parses plain and English formatting", () => {
    expect(parseAmountToMinor("1234.56")).toBe(123456);
    expect(parseAmountToMinor("1,234.56")).toBe(123456);
  });

  it("treats a separator as thousands when not followed by two digits", () => {
    expect(parseAmountToMinor("1.234")).toBe(123400);
    expect(parseAmountToMinor("1,234")).toBe(123400);
  });

  it("keeps a negative sign", () => {
    expect(parseAmountToMinor("-45,30")).toBe(-4530);
  });

  it("returns null when there is no number", () => {
    expect(parseAmountToMinor("")).toBeNull();
    expect(parseAmountToMinor(null)).toBeNull();
    expect(parseAmountToMinor("keine Angabe")).toBeNull();
  });

  it("round-trips through the German formatter", () => {
    for (const raw of ["0,99", "88,00", "1.234,56", "1.000.000,00"]) {
      expect(formatMinorAsGerman(parseAmountToMinor(raw)!)).toBe(raw);
    }
  });
});

describe("toIsoDateOrNull", () => {
  it("passes ISO dates through", () => {
    expect(toIsoDateOrNull("2026-07-24")).toBe("2026-07-24");
    expect(toIsoDateOrNull("2026-07-24T10:00:00Z")).toBe("2026-07-24");
  });

  it("converts German dates", () => {
    expect(toIsoDateOrNull("24.07.2026")).toBe("2026-07-24");
    expect(toIsoDateOrNull("4.7.2026")).toBe("2026-07-04");
    expect(toIsoDateOrNull("24.07.26")).toBe("2026-07-24");
  });

  it("returns null for values a Postgres date column would reject", () => {
    // Unsanitised, these abort the whole confirm transaction.
    expect(toIsoDateOrNull("Montag")).toBeNull();
    expect(toIsoDateOrNull("nächste Woche")).toBeNull();
    expect(toIsoDateOrNull("")).toBeNull();
    expect(toIsoDateOrNull(null)).toBeNull();
  });
});
