import {
  confirmDocumentReview,
  canReviewDocument,
  documentTypeLabels,
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

  it("posts the complete analysis only to the protected confirm route", async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    await confirmDocumentReview("doc-1", analysis);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/documents/doc-1/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...analysis,
        status: undefined,
        deletedTaskIndices: [],
        calendar_events: [],
      }),
    });
  });
});
