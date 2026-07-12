import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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
// the supabase mock if a Review Card happens to render.
vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn().mockResolvedValue([]),
  fetchExistingCategories: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/documents-table", () => ({
  fetchDocumentsTableMeta: vi.fn().mockResolvedValue({}),
}));

import DokumentePage from "@/app/(app)/dokumente/page";
import { ScanProvider } from "@/lib/scan/scan-context";
import { CollectionsProvider } from "@/lib/collections/collections-context";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import { triggerOcr } from "@/lib/ocr";

const FAMILY_ID = "fam-auto-0000-0000-0000-000000000001";

/**
 * A pre-existing document stuck in 'ocr_done' with no OCR text — the
 * kind of document that causes a 400 NO_OCR_TEXT error when auto-analyze
 * fires on mount/navigation.
 */
function ocrDoneDoc(
  id = "doc-ocr-done-1",
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    family_id: FAMILY_ID,
    uploaded_by: "user-1",
    title: "Ein Dokument",
    document_type: null,
    category: null,
    status: "ocr_done",
    file_url: `${FAMILY_ID}/${id}/file.pdf`,
    original_filename: "file.pdf",
    mime_type: "application/pdf",
    page_count: 1,
    ocr_text: null, // stuck/OCR-less — no OCR text
    summary: null,
    error_message: null,
    created_at: new Date().toISOString(),
    confirmed_at: null,
    ...overrides,
  };
}

/**
 * Build a mock browser Supabase client whose `families` query resolves to
 * a single family and whose `documents` query delegates to `getDocuments`
 * so the test can mutate the returned list between calls (simulating a
 * document transitioning to ocr_done after the initial load).
 */
function mockSupabaseClient(getDocuments: () => unknown[]) {
  const documentsChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(async () => ({
      data: getDocuments(),
      error: null,
    })),
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
      if (table === "collections") {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createClient>;
}

/**
 * Extract only the fetch calls targeting the analyze endpoint.
 */
function analyzeCalls(fetchSpy: ReturnType<typeof vi.spyOn>) {
  return fetchSpy.mock.calls.filter(
    (args: unknown[]) =>
      typeof args[0] === "string" &&
      (args[0] as string).includes("/analyze"),
  );
}

describe("DokumentePage auto-analyze navigation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent auto-switch to table view (desktop default) in jsdom
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT fire POST analyze on mount for a pre-existing ocr_done document", async () => {
    const doc = ocrDoneDoc();
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => [doc]),
    );

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "analyzed" }), {
          status: 200,
        }),
      );

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    // Wait for the document list to render (initial load complete).
    await screen.findByTestId("document-list");

    // Give the auto-analyze effect a chance to settle.
    await waitFor(() => {
      expect(screen.getByTestId("document-list")).toBeDefined();
    });

    // No analyze POST should have been fired for the pre-existing
    // ocr_done document.
    expect(analyzeCalls(fetchSpy).length).toBe(0);

    fetchSpy.mockRestore();
  });

  it("auto-analyzes a document that reaches ocr_done after an in-session upload", async () => {
    // Simulate: initial load shows no documents. After the user uploads
    // a file, fetchDocuments is called again and the mock returns the
    // freshly-OCR'd document at ocr_done. The auto-analyze effect should
    // fire for this doc because it was NOT in ocr_done during the initial
    // load (it reached ocr_done during the session).
    let callCount = 0;
    const freshDoc = ocrDoneDoc("doc-fresh-1", {
      ocr_text: "Echter OCR-Text",
      page_count: 1,
    });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => {
        callCount++;
        return callCount <= 1 ? [] : [freshDoc];
      }),
    );

    vi.mocked(uploadFile).mockResolvedValue({
      document_id: "doc-fresh-1",
      status: "uploaded",
    });
    vi.mocked(triggerOcr).mockResolvedValue({
      status: "ocr_done",
      page_count: 1,
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "analyzed" }), {
          status: 200,
        }),
      );

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    // Wait for the initial load to complete (empty list → empty state).
    await screen.findByTestId("empty-state");

    // No analyze yet — the initial load had no ocr_done documents.
    expect(analyzeCalls(fetchSpy).length).toBe(0);

    // Simulate a file upload via the camera input.
    const cameraInput = screen.getByTestId("camera-input") as HTMLInputElement;
    const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
    fireEvent.change(cameraInput, { target: { files: [file] } });

    // After the upload, fetchDocuments returns the doc at ocr_done.
    // The auto-analyze effect should fire because this doc was not
    // present during the initial load.
    await waitFor(() => {
      expect(analyzeCalls(fetchSpy).length).toBeGreaterThan(0);
    });

    // Verify it analyzed the correct document.
    expect(analyzeCalls(fetchSpy)[0][0]).toBe(
      "/api/documents/doc-fresh-1/analyze",
    );

    fetchSpy.mockRestore();
  });
});
