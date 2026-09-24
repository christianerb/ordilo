import { describe, expect, it } from "vitest";
import {
  GENERIC_AMOUNT_LABELS,
  GENERIC_DATE_LABELS,
  attachTimesToDates,
  cleanupAnalysisEntities,
  dedupeAmounts,
  dedupeDates,
  dropDocumentDateEvents,
  dropTasksDuplicatingAppointments,
  formatMinorAsGerman,
  labelDocumentDates,
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
    expect(result.tasks).toEqual(base.tasks);
  });

  it("folds a lone time into its date and drops a task that repeats an appointment", () => {
    const result = cleanupAnalysisEntities({
      ...base,
      dates: [
        date("2026-09-01", "Datum", { type: "document_date" }),
        date("2026-10-12", "Klassenfahrt"),
        date("08:15", "Abfahrt Klassenfahrt", { type: "time" }),
        date("2026-09-14", "Elternabend"),
      ],
      tasks: [
        { title: "Elternabend", due_date: "2026-09-14", confidence: 0.9 },
        { title: "Zum Elternabend anmelden", due_date: "2026-09-10", confidence: 0.9 },
      ],
    });
    expect(result.dates.map((d) => [d.date, d.label])).toEqual([
      ["2026-09-01", "Briefdatum"],
      ["2026-10-12", "Klassenfahrt · Abfahrt 08:15 Uhr"],
      ["2026-09-14", "Elternabend"],
    ]);
    expect(result.tasks.map((t) => t.title)).toEqual(["Zum Elternabend anmelden"]);
  });
});

describe("attachTimesToDates", () => {
  it("attaches a time to the date whose label shares a word", () => {
    const result = attachTimesToDates([
      date("2026-10-12", "Abfahrt Klassenfahrt"),
      date("2026-10-16", "Rückkehr Klassenfahrt"),
      date("08:15", "Abfahrt"),
    ]);
    expect(result.map((d) => d.label)).toEqual([
      "Abfahrt Klassenfahrt · 08:15 Uhr",
      "Rückkehr Klassenfahrt",
    ]);
  });

  it("prefers the most specific label over the first shared word", () => {
    const result = attachTimesToDates([
      date("2026-10-16", "Rückkehr Klassenfahrt"),
      date("2026-10-12", "Abfahrt Klassenfahrt"),
      date("08:15", "Abfahrt Klassenfahrt"),
    ]);
    expect(result.map((d) => d.label)).toEqual([
      "Rückkehr Klassenfahrt",
      "Abfahrt Klassenfahrt · 08:15 Uhr",
    ]);
  });

  it("uses the only real date when no label matches", () => {
    const result = attachTimesToDates([
      date("2026-09-01", "Briefdatum", { type: "document_date" }),
      date("2026-10-12", "Klassenfahrt"),
      date("8:15 Uhr", "Abfahrt", { type: "time" }),
    ]);
    expect(result.map((d) => d.label)).toEqual([
      "Briefdatum",
      "Klassenfahrt · Abfahrt 08:15 Uhr",
    ]);
  });

  it("does not repeat a time the label already carries", () => {
    const result = attachTimesToDates([
      date("2026-10-12", "Abfahrt 8:15 Uhr"),
      date("08:15", "Abfahrt"),
    ]);
    expect(result).toEqual([date("2026-10-12", "Abfahrt 8:15 Uhr")]);
  });

  it("drops a time it cannot place and unreadable time entries", () => {
    const result = attachTimesToDates([
      date("2026-09-14", "Elternabend"),
      date("2026-09-20", "Schulfest"),
      date("19:25", "Abflug"),
      date("morgens", "Treffen", { type: "time" }),
    ]);
    expect(result.map((d) => d.label)).toEqual(["Elternabend", "Schulfest"]);
  });

  it("keeps a German date that only looks like a time", () => {
    const result = attachTimesToDates([date("12.07.", "Sommerfest")]);
    expect(result).toEqual([date("12.07.", "Sommerfest")]);
  });

  it("splits an ISO date-time into the date and a time in the label", () => {
    expect(
      attachTimesToDates([date("2026-10-12T08:15:00", "Abfahrt")]),
    ).toEqual([date("2026-10-12", "Abfahrt · 08:15 Uhr")]);
    expect(
      attachTimesToDates([date("2026-10-12T00:00:00Z", "Klassenfahrt")]),
    ).toEqual([date("2026-10-12", "Klassenfahrt")]);
  });
});

describe("dropTasksDuplicatingAppointments", () => {
  const dates = [date("2026-09-14", "Elternabend Klasse 3b")];
  const task = (title: string, due_date: string | null) => ({
    title,
    due_date,
    confidence: 0.9,
  });

  it("drops a task that only names the appointment on the same day", () => {
    expect(
      dropTasksDuplicatingAppointments([task("Elternabend 14.09.", "2026-09-14")], dates),
    ).toEqual([]);
  });

  it("keeps a task that asks for something to be done", () => {
    const kept = [
      task("Anmeldung zum Elternabend bis 10.09.", "2026-09-10"),
      task("Zum Elternabend Unterschrift mitbringen", "2026-09-14"),
    ];
    expect(dropTasksDuplicatingAppointments(kept, dates)).toEqual(kept);
  });

  it("keeps a same-day task that says more than the appointment, whatever the verb", () => {
    const schulfest = [date("2026-09-20", "Schulfest")];
    const kept = [task("Fotos beim Schulfest machen", "2026-09-20"), task("Kuchen fürs Schulfest", "2026-09-20")];
    expect(dropTasksDuplicatingAppointments(kept, schulfest)).toEqual(kept);
    expect(
      dropTasksDuplicatingAppointments([task("Schulfest besuchen", "2026-09-20"), task("Zum Elternabend am Abend", "2026-09-14")], [...schulfest, ...dates]),
    ).toEqual([]);
  });

  it("keeps a task whose action sits in the date's own label", () => {
    const kept = [task("Anmeldung zum Elternabend", "2026-09-10"), task("Reisepass", "2026-10-01")];
    expect(
      dropTasksDuplicatingAppointments(kept, [
        date("2026-09-10", "Anmeldung zum Elternabend"),
        date("2026-10-01", "Reise nach Italien"),
      ]),
    ).toEqual(kept);
  });

  it("keeps the same noun on another day and tasks without a date", () => {
    const kept = [task("Elternabend", "2026-09-21"), task("Elternabend", null)];
    expect(dropTasksDuplicatingAppointments(kept, dates)).toEqual(kept);
  });

  it("ignores deadlines and the document's own date", () => {
    const kept = [task("Zahlungsfrist", "2026-09-30"), task("Briefdatum", "2026-09-01")];
    expect(
      dropTasksDuplicatingAppointments(kept, [
        date("2026-09-30", "Zahlungsfrist Klassenfahrt"),
        date("2026-09-01", "Briefdatum"),
      ]),
    ).toEqual(kept);
  });
});

describe("labelDocumentDates", () => {
  it("gives every document-date type a label that survives storage", () => {
    const result = labelDocumentDates([
      date("2026-09-01", "Datum", { type: "issue_date" }),
      date("2026-09-02", "", { type: "letter_date" }),
      date("2026-09-03", "", { type: "document_date" }),
      date("2026-09-04", "", { type: "date" }),
    ]);
    expect(result.map((d) => d.label)).toEqual(["Briefdatum", "Briefdatum", "Briefdatum", ""]);
  });
});

describe("dropDocumentDateEvents", () => {
  it("never turns the document's own date into an event", () => {
    const dates = [
      date("2026-09-01", "Datum des Elternbriefs"),
      date("2026-09-14", "Elternabend"),
      date("2026-09-20", "Briefdatum"),
      date("2026-09-20", "Sportfest"),
    ];
    expect(
      dropDocumentDateEvents(
        [
          { date: "2026-09-01", label: "Elternbrief Klasse 3b" },
          { date: "2026-09-14", label: "Elternabend" },
          { date: "2026-09-14", label: "Briefdatum" },
          { date: "2026-09-20", label: "Sportfest" },
        ],
        dates,
      ),
    ).toEqual([
      { date: "2026-09-14", label: "Elternabend" },
      { date: "2026-09-20", label: "Sportfest" },
    ]);
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
