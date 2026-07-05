import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the supabase browser client and the upload/ocr helpers so the
// page can render without network calls.
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/upload", () => ({
  uploadFile: vi.fn(),
}));
vi.mock("@/lib/ocr", () => ({
  triggerOcr: vi.fn(),
}));
// Mock the analysis helpers used by the Review Card so it does not hit
// the supabase mock (which only knows the `families` and `documents`
// tables the scan page queries).
vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn().mockResolvedValue([
    { id: "member-1", name: "Emma", role: "Kind" },
    { id: "member-2", name: "Hanna", role: "Kind" },
  ]),
  fetchExistingCategories: vi.fn().mockResolvedValue(["Kita"]),
}));

import ScanPage from "@/app/(app)/scan/page";
import { createClient } from "@/lib/supabase/client";
import { triggerOcr } from "@/lib/ocr";

const FAMILY_ID = "fam-retry-0000-0000-0000-000000000001";

/**
 * Build a mock browser Supabase client whose `families` query resolves to
 * a single family and whose `documents` query resolves to the given list.
 */
function mockSupabaseClient(documents: unknown[] = []) {
  const documentsChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: documents, error: null }),
  };
  const familiesChain = {
    limit: vi.fn(() => ({
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: FAMILY_ID }, error: null }),
    })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "families") {
        return { select: vi.fn(() => familiesChain) };
      }
      if (table === "documents") {
        return { select: vi.fn(() => documentsChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createClient>;
}

/**
 * Build a failed document row for a given stage.
 *
 * - OCR-stage failure: no ocr_text, no page_count (OCR never completed).
 * - Analysis-stage failure: ocr_text present, page_count set (OCR
 *   completed, analysis failed).
 */
function failedDoc(stage: "ocr" | "analysis", idSuffix: string) {
  const ocrDone = stage === "analysis";
  return {
    id: `doc-${idSuffix}`,
    family_id: FAMILY_ID,
    uploaded_by: "user-1",
    title: ocrDone ? "Analysiertes Dokument" : null,
    document_type: null,
    category: null,
    status: "failed",
    file_url: `${FAMILY_ID}/doc-${idSuffix}/file.pdf`,
    original_filename: "file.pdf",
    mime_type: "application/pdf",
    page_count: ocrDone ? 2 : null,
    ocr_text: ocrDone ? "OCR-Inhalt hier" : null,
    summary: null,
    error_message:
      stage === "ocr" ? "OCR fehlgeschlagen." : "Analyse fehlgeschlagen.",
    created_at: new Date().toISOString(),
    confirmed_at: null,
  };
}

describe("ScanPage failed-document retry routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes an OCR-stage failed document's card retry to the OCR endpoint", async () => {
    const doc = failedDoc("ocr", "ocr-1");
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([doc]),
    );
    vi.mocked(triggerOcr).mockResolvedValue({
      status: "ocr_done",
      page_count: 1,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "analyzed" }), { status: 200 }),
      );

    render(<ScanPage />);

    // Wait for the document list to render.
    await screen.findByTestId("document-list");

    // Click the document-card retry button.
    const retryButton = screen.getByTestId("document-retry-button");
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(triggerOcr).toHaveBeenCalledWith("doc-ocr-1");
    });

    // The analyze endpoint must NOT be called for an OCR-stage failure.
    const analyzeCalls = fetchSpy.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("/analyze"),
    );
    expect(analyzeCalls.length).toBe(0);

    fetchSpy.mockRestore();
  });

  it("routes an analysis-stage failed document's card retry to the analyze endpoint", async () => {
    const doc = failedDoc("analysis", "an-1");
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([doc]),
    );
    vi.mocked(triggerOcr).mockResolvedValue({
      status: "ocr_done",
      page_count: 2,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "analyzed" }), { status: 200 }),
      );

    render(<ScanPage />);

    await screen.findByTestId("document-list");

    const retryButton = screen.getByTestId("document-retry-button");
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/documents/doc-an-1/analyze",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // The OCR endpoint must NOT be called for an analysis-stage failure.
    expect(triggerOcr).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("routes an OCR-stage failed document's Review Card retry to the OCR endpoint", async () => {
    const doc = failedDoc("ocr", "ocr-2");
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([doc]),
    );
    vi.mocked(triggerOcr).mockResolvedValue({
      status: "ocr_done",
      page_count: 1,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "analyzed" }), { status: 200 }),
      );

    render(<ScanPage />);

    await screen.findByTestId("document-list");

    // Expand the failed document to reveal the Review Card.
    const expandButton = screen.getByRole("button", {
      name: /review öffnen/i,
    });
    fireEvent.click(expandButton);

    // The Review Card error retry button should appear.
    const reviewRetry = await screen.findByTestId("review-retry-button");
    fireEvent.click(reviewRetry);

    await waitFor(() => {
      expect(triggerOcr).toHaveBeenCalledWith("doc-ocr-2");
    });

    // The analyze endpoint must NOT be called.
    const analyzeCalls = fetchSpy.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("/analyze"),
    );
    expect(analyzeCalls.length).toBe(0);

    fetchSpy.mockRestore();
  });

  it("routes an analysis-stage failed document's Review Card retry to the analyze endpoint", async () => {
    const doc = failedDoc("analysis", "an-2");
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([doc]),
    );
    vi.mocked(triggerOcr).mockResolvedValue({
      status: "ocr_done",
      page_count: 2,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "analyzed" }), { status: 200 }),
      );

    render(<ScanPage />);

    await screen.findByTestId("document-list");

    // Expand the failed document to reveal the Review Card.
    const expandButton = screen.getByRole("button", {
      name: /review öffnen/i,
    });
    fireEvent.click(expandButton);

    const reviewRetry = await screen.findByTestId("review-retry-button");
    fireEvent.click(reviewRetry);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/documents/doc-an-2/analyze",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // The OCR endpoint must NOT be called.
    expect(triggerOcr).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
