import { buildCorrectionPayload, loadCorrectionBaseline, saveDocumentCorrections } from "../lib/document-corrections";
import { loadDocumentReview, type ReviewAnalysis } from "../lib/document-review";
import { apiFetch } from "../lib/api";
const mockRpc = jest.fn();
jest.mock("../lib/supabase", () => ({ getSupabase: () => ({ rpc: mockRpc }) }));
jest.mock("../lib/document-review", () => ({ loadDocumentReview: jest.fn() }));
jest.mock("../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-file-system", () => ({ File: class {} }));
const document: ReviewAnalysis = {
  title: "Brief", summary: "Ausflug", document_type: "school", status: "confirmed", created_at: "2026-09-01", confirmed_at: "2026-09-01", original_filename: "brief.pdf", mime_type: "application/pdf", page_count: 1, credential_text: null,
  family_members: [], organizations: [], contacts: [], amounts: [], tags: [], suggested_category: "Schule", needs_user_review: false,
  dates: [{ id: "date-a", date: "2026-10-01", label: "Ausflug", type: "event", confidence: 1 }, { id: "date-b", date: "2026-10-02", label: "Treffen", type: "event", confidence: 1 }],
  tasks: [{ id: "task-a", title: "Zahlen", due_date: "2026-10-01", confidence: 1 }],
  facts: [{ id: "fact-a", fact_type: "identifier", label: "Nummer", value: "123", confidence: 1 }],
};
beforeEach(() => jest.clearAllMocks());
it("keeps stable task/fact IDs and matches date corrections by ID after removal", () => {
  const payload = buildCorrectionPayload({ document, revision: "a".repeat(32) }, { ...document, dates: [{ ...document.dates[1], date: "2026-10-09" }] });
  expect(payload.corrections.tasks).toEqual([{ id: "task-a", title: "Zahlen", due_date: "2026-10-01" }]);
  expect(payload.corrections.facts[0].id).toBe("fact-a");
  expect(payload.corrections.date_changes).toEqual([{ previous_date: "2026-10-02", previous_label: "Treffen", date: "2026-10-09", label: "Treffen" }]);
  expect(payload).not.toHaveProperty("status");
});
it("rejects a mixed snapshot changed during loading", async () => {
  mockRpc.mockResolvedValueOnce({ data: "a".repeat(32), error: null }).mockResolvedValueOnce({ data: "b".repeat(32), error: null });
  jest.mocked(loadDocumentReview).mockResolvedValue(document);
  await expect(loadCorrectionBaseline("doc")).rejects.toThrow("inzwischen geändert");
});
it("sends metadata and consequences in one request and propagates failures", async () => {
  jest.mocked(apiFetch).mockRejectedValue(new Error("conflict"));
  await expect(saveDocumentCorrections("doc", { document, revision: "a".repeat(32) }, document)).rejects.toThrow("conflict");
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(apiFetch).toHaveBeenCalledWith("/api/documents/doc", expect.objectContaining({ method: "PATCH" }));
});

it("allows existing unlabeled dates without guessing which calendar event to move", () => {
  const baseline = { document: { ...document, dates: [{ ...document.dates[0], label: "" }] }, revision: "a".repeat(32) };
  const payload = buildCorrectionPayload(baseline, { ...baseline.document, title: "Neuer Titel" });
  expect(payload.dates[0].label).toBe("");
  expect(payload.corrections.date_changes).toEqual([]);
});
