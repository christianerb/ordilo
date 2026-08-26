import {
  buildConfirmDocumentPayload,
  confirmDocumentReview,
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
});
