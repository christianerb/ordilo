import {
  buildConfirmDocumentPayload,
  confirmDocumentReview,
  canReviewDocument,
  documentTypeLabels,
  isImageFile,
  isSafeOriginalFileUrl,
  type ReviewAnalysis,
} from "../lib/document-review";

const mockApiFetch = jest.fn();

jest.mock("../lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
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
});
