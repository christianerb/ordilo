import {
  buildConfirmDocumentPayload,
  calendarEligibleDateIndices,
  confirmDocumentReview,
  defaultCalendarDateIndices,
  isDeadlineLike,
  remapCalendarSelection,
  formatRelativeDays,
  formatReviewAmount,
  getDocumentConsequences,
  canReviewDocument,
  deleteDocument,
  documentTypeLabels,
  isImageFile,
  isSafeOriginalFileUrl,
  parseCredentialFields,
  reconstructStoredEntities,
  revealDocumentSecret,
  type ReviewAnalysis,
} from "../lib/document-review";

const mockApiFetch = jest.fn();
const mockApiJson = jest.fn();

jest.mock("../lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiJson: (...args: unknown[]) => mockApiJson(...args),
}));
jest.mock("../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

const analysis: ReviewAnalysis = {
  document_type: "invoice",
  title: "Stromrechnung",
  summary: "Rechnung für Juli.",
  family_members: [],
  organizations: [],
  contacts: [],
  dates: [],
  amounts: [],
  tasks: [],
  facts: [],
  suggested_category: "Haushalt",
  tags: ["Strom"],
  needs_user_review: false,
  status: "analyzed",
  created_at: "2026-07-04T12:00:00.000Z",
  confirmed_at: null,
  original_filename: "strom.pdf",
  mime_type: "application/pdf",
  page_count: 2,
  credential_text: null,
};

describe("document review", () => {
  it("uses German labels for the document type", () => {
    expect(documentTypeLabels.invoice).toBe("Rechnung");
    expect(documentTypeLabels.credentials).toBe("Zugangsdaten");
  });

  it("only offers review for an analysed document", () => {
    expect(canReviewDocument("analyzed")).toBe(true);
    expect(canReviewDocument("confirmed")).toBe(false);
    expect(canReviewDocument("failed")).toBe(false);
  });

  it("posts only the ConfirmPayload contract to the protected confirm route", async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    await confirmDocumentReview("doc-1", analysis);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/doc-1/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildConfirmDocumentPayload(analysis)),
    });
  });

  it("does not leak UI status and omits deliberately emptied contract rows", () => {
    const payload = buildConfirmDocumentPayload({
      ...analysis,
      title: "  Stromrechnung  ",
      tags: [" Strom ", ""],
      family_members: [{ person_id: null, name: "  ", confidence: 1 }],
      tasks: [{ title: "  ", due_date: "  ", confidence: 1 }],
      facts: [{ fact_type: "identifier", label: "  ", value: "4711", confidence: 1 }],
    });

    expect(payload).toEqual({
      document_type: "invoice",
      title: "Stromrechnung",
      summary: "Rechnung für Juli.",
      family_members: [],
      organizations: [],
      contacts: [],
      dates: [],
      amounts: [],
      tasks: [],
      facts: [],
      suggested_category: "Haushalt",
      tags: ["Strom"],
      needs_user_review: false,
      deletedTaskIndices: [],
      calendar_events: [],
    });
    expect(payload).not.toHaveProperty("status");
  });

  it("only accepts HTTPS signed original URLs and identifies image originals", () => {
    expect(isSafeOriginalFileUrl("https://project.supabase.co/storage/v1/object/sign/file.pdf")).toBe(true);
    expect(isSafeOriginalFileUrl("http://project.supabase.co/file.pdf")).toBe(false);
    expect(isSafeOriginalFileUrl("javascript:alert(1)")).toBe(false);
    expect(isImageFile("image/jpeg")).toBe(true);
    expect(isImageFile("application/pdf")).toBe(false);
  });

  it("uses the protected routes for intentional secret reveal and deletion", async () => {
    mockApiJson.mockResolvedValueOnce({ secret: "nur-kurz" });
    mockApiFetch.mockResolvedValueOnce({ ok: true });

    await expect(revealDocumentSecret("doc-1")).resolves.toBe("nur-kurz");
    await deleteDocument("doc-1");

    expect(mockApiJson).toHaveBeenCalledWith("/api/documents/doc-1/secret", {
      method: "POST",
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/doc-1", {
      method: "DELETE",
    });
  });

  it("extracts only the known credential fields", () => {
    expect(
      parseCredentialFields(
        "- **URL:** https://familie.example\n- **Benutzername:** familie@example.de\n\nNotiz",
      ),
    ).toEqual({
      url: "https://familie.example",
      username: "familie@example.de",
    });
    expect(parseCredentialFields("Zettel am Router")).toEqual({
      url: null,
      username: null,
    });
  });

  it("reconstructs contacts, dates, and typed amounts from stored entity rows", () => {
    const result = reconstructStoredEntities([
      {
        entity_type: "contact",
        entity_value: JSON.stringify({
          name: "Anna Beispiel",
          organization: "Schule",
          role: "Sekretariat",
          phone: "0123",
          email: "anna@example.de",
        }),
        confidence: 0.9,
      },
      {
        entity_type: "date",
        entity_value: "2026-09-01",
        label: "Elternabend",
        confidence: 0.8,
      },
      {
        entity_type: "amount",
        entity_value: "17 EUR",
        normalized_value: "17",
        currency: "EUR",
        label: "Offen",
        amount_kind: "outstanding",
        value_date: "2026-09-02",
        confidence: 0.7,
      },
      {
        entity_type: "contact",
        entity_value: JSON.stringify({
          name: "Kontakt ohne Kanal",
          organization: "",
          role: "",
          phone: "",
          email: "",
        }),
        confidence: 0.6,
      },
    ]);

    expect(result.contacts).toEqual([{
      name: "Anna Beispiel",
      organization: "Schule",
      role: "Sekretariat",
      phone: "0123",
      email: "anna@example.de",
      confidence: 0.9,
    }]);
    expect(result.dates).toEqual([{
      date: "2026-09-01",
      type: "date",
      label: "Elternabend",
      confidence: 0.8,
    }]);
    expect(result.amounts).toEqual([{
      amount: "17",
      currency: "EUR",
      label: "Offen",
      kind: "outstanding",
      value_date: "2026-09-02",
      confidence: 0.7,
    }]);
  });

  it("turns kept dates into calendar events and leaves the rest alone", () => {
    const payload = buildConfirmDocumentPayload(
      {
        ...analysis,
        title: "Elternbrief",
        dates: [
          { date: "2026-09-08", label: "Sportfest", type: "date", confidence: 1 },
          { date: "2026-09-12", label: "", type: "date", confidence: 1 },
          { date: "irgendwann", label: "Unklar", type: "date", confidence: 0.4 },
        ],
      },
      { calendarDateIndices: [0, 1, 2] },
    );
    expect(payload.calendar_events).toEqual([
      { date: "2026-09-08", label: "Sportfest" },
      { date: "2026-09-12", label: "Elternbrief" },
    ]);
    expect(buildConfirmDocumentPayload(analysis).calendar_events).toEqual([]);
  });

  it("formats amounts and relative days the German way", () => {
    expect(formatReviewAmount("84,20", "EUR")).toBe("84,20\u00a0€");
    expect(formatReviewAmount("1.250,00", "eur")).toBe("1.250,00\u00a0€");
    expect(formatReviewAmount("ca. 80", "EUR")).toBe("ca. 80 EUR");
    const now = new Date(2026, 8, 2);
    expect(formatRelativeDays("2026-09-02", now)).toBe("heute");
    expect(formatRelativeDays("2026-09-03", now)).toBe("morgen");
    expect(formatRelativeDays("2026-09-08", now)).toBe("in 6 Tagen");
    expect(formatRelativeDays("2026-08-30", now)).toBe("vor 3 Tagen");
    expect(formatRelativeDays("2027-03-01", now)).toBeNull();
    expect(formatRelativeDays("bald", now)).toBeNull();
  });

  it("lists what a document means: dates first, then tasks, money and numbers", () => {
    const consequences = getDocumentConsequences(
      {
        ...analysis,
        dates: [
          { date: "2026-09-12", label: "Rückgabe", type: "date", confidence: 1 },
          { date: "2026-09-08", label: "Sportfest", type: "date", confidence: 1 },
        ],
        tasks: [{ title: "Sportzeug einpacken", due_date: "2026-09-08", confidence: 1 }],
        amounts: [{ amount: "12,50", currency: "EUR", label: "", kind: "total", value_date: null, confidence: 1 }],
        facts: [{ fact_type: "identifier", label: "Kundennummer", value: "4711", confidence: 1 }],
      },
      new Date(2026, 8, 2),
    );
    expect(consequences.map((entry) => entry.kind)).toEqual(["date", "date", "task", "amount", "fact"]);
    expect(consequences[0]).toMatchObject({ label: "Sportfest", dateLabel: "Di., 8. Sept.", relative: "in 6 Tagen", index: 1 });
    expect(consequences[3]).toMatchObject({ label: "Gesamtbetrag", value: "12,50\u00a0€" });
  });
});

/**
 * The calendar defaults mirror src/lib/calendar-heuristics.ts on the web:
 * appointments pre-checked, deadlines and past dates not.
 */
describe("calendar pre-selection", () => {
  const dates = [
    { date: "2026-09-10", label: "Elternabend Kita", confidence: 0.95 },
    { date: "2026-09-30", label: "Zahlungsfrist", confidence: 0.95 },
    { date: "2026-08-01", label: "Arzttermin", confidence: 0.95 },
    { date: "2026-09-12", label: "Impfung", confidence: 0.4 },
    { date: "19:25", label: "Abflug", confidence: 0.95 },
  ];
  const today = "2026-09-03";

  it("offers only real ISO dates from today on", () => {
    expect(calendarEligibleDateIndices(dates, today)).toEqual([0, 1, 3]);
  });

  it("pre-checks confident appointments and nothing else", () => {
    expect(defaultCalendarDateIndices(dates, today)).toEqual([0]);
  });

  it("reads deadline words the way the web does", () => {
    expect(isDeadlineLike("Zahlungsfrist")).toBe(true);
    expect(isDeadlineLike("Gültig bis")).toBe(true);
    expect(isDeadlineLike("Anmeldefrist für den Ausflug")).toBe(true);
    expect(isDeadlineLike("Elternabend")).toBe(false);
  });

  it("keeps the selection on the same dates when one is removed", () => {
    // Date 0 checked, date 1 deliberately unchecked: removing date 0 must
    // not promote the unchecked one into the planner.
    expect([...remapCalendarSelection(new Set([0, 2]), 0)]).toEqual([1]);
    expect([...remapCalendarSelection(new Set([0, 2]), 3)]).toEqual([0, 2]);
    expect([...remapCalendarSelection(new Set([1]), 1)]).toEqual([]);
  });
});
