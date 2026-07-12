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

const FAMILY_ID = "fam-click-0000-0000-0000-000000000001";

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

function buildDoc(status: string, idSuffix: string) {
  return {
    id: `doc-${idSuffix}`,
    family_id: FAMILY_ID,
    uploaded_by: "user-1",
    title: status === "uploaded" ? null : "Kita-Brief",
    document_type: null,
    category: null,
    status,
    file_url: `${FAMILY_ID}/doc-${idSuffix}/file.pdf`,
    original_filename: "file.pdf",
    mime_type: "application/pdf",
    page_count: null,
    ocr_text: null,
    summary: null,
    error_message: null,
    created_at: new Date().toISOString(),
    confirmed_at: null,
  };
}

/**
 * Regression coverage for VAL-SCAN-041: clicking a document card while it
 * is still uploading/being read used to do nothing at all (no onClick,
 * no visual feedback), while clicking a card in a later status expanded
 * a Review Card — the exact "sometimes I see something, sometimes
 * nothing" inconsistency reported by users. Every document card must now
 * be clickable and show *something* on expand, regardless of status.
 */
describe("DokumentePage — document card click consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent auto-switch to table view (desktop default) in jsdom
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
  });

  it.each(["uploaded", "ocr_processing", "ocr_done"])(
    "expanding a document card with status '%s' shows the honest processing checklist instead of doing nothing",
    async (status) => {
      const doc = buildDoc(status, status);
      (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
        mockSupabaseClient([doc]),
      );

      render(
        <ScanProvider>
        <CollectionsProvider>
          <DokumentePage />
        </CollectionsProvider>
      </ScanProvider>,
      );
      await screen.findByTestId("document-list");

      const card = screen.getByTestId("document-card");
      // The card is now interactive for every status.
      expect(card.getAttribute("role")).toBe("button");

      fireEvent.click(card);

      expect(
        await screen.findByTestId("review-card-processing"),
      ).toBeDefined();
    },
  );

  it("clicking a document card in a reviewable status (analyzed) still shows the full Review Card", async () => {
    const doc = {
      ...buildDoc("analyzed", "analyzed-1"),
      title: "Kita-Brief",
    };
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([doc]),
    );

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );
    await screen.findByTestId("document-list");

    const card = screen.getByTestId("document-card");
    fireEvent.click(card);

    // Falls into the ReviewCard's own loading/skeleton or content state —
    // in any case NOT the "do nothing" behavior. The processing state
    // (reserved for pre-analysis statuses) must not appear here. Wrapped
    // in waitFor so ReviewCard's async mount effects (fetchFamilyMembers,
    // fetchDocumentAnalysis, ...) settle within act().
    await waitFor(() => {
      expect(screen.queryByTestId("review-card-processing")).toBeNull();
    });
  });

  it("every document card, regardless of status, is keyboard-activatable (role=button, tabIndex=0)", async () => {
    const docs = ["uploaded", "ocr_processing", "ocr_done", "analyzed", "confirmed", "failed"].map(
      (status, i) => buildDoc(status, `${i}`),
    );
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(docs),
    );

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );
    await screen.findByTestId("document-list");

    // Non-confirmed docs appear in "Zum Durchsehen" section (5 of 6).
    // The confirmed doc is inside a collapsed folder — expand it first.
    const folderButtons = document.body.querySelectorAll(
      '[data-testid^="folder-"] button[aria-expanded="false"]',
    );
    folderButtons.forEach((btn) => fireEvent.click(btn));

    const cards = screen.getAllByTestId("document-card");
    expect(cards).toHaveLength(docs.length);
    for (const card of cards) {
      expect(card.getAttribute("role")).toBe("button");
      expect(card.getAttribute("tabindex")).toBe("0");
    }
  });
});
