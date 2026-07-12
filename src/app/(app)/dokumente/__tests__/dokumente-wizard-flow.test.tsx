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

import DokumentePage from "@/app/(app)/dokumente/page";
import { ScanProvider } from "@/lib/scan/scan-context";
import { CollectionsProvider } from "@/lib/collections/collections-context";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import { triggerOcr } from "@/lib/ocr";
import { fetchDocumentAnalysis } from "@/lib/analysis";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";

const FAMILY_ID = "fam-wizard-0000-0000-0000-000000000001";

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

function analyzedDoc(id: string) {
  return {
    id,
    family_id: FAMILY_ID,
    uploaded_by: "user-1",
    title: "Kita-Brief für Emma",
    document_type: "school",
    category: null,
    status: "analyzed",
    file_url: `${FAMILY_ID}/${id}/scan.jpg`,
    original_filename: "scan.jpg",
    mime_type: "image/jpeg",
    page_count: 1,
    ocr_text: "OCR-Text",
    summary: null,
    error_message: null,
    created_at: new Date().toISOString(),
    confirmed_at: null,
  };
}

const analysis: DocumentAnalysis = {
  document_type: "school",
  title: "Kita-Brief für Emma",
  summary: "Ein Brief der Kita.",
  family_members: [],
  organizations: [],
  dates: [],
  amounts: [],
  tasks: [],
  facts: [],
  suggested_category: "Kita",
  tags: [],
  needs_user_review: false,
};

describe("DokumentePage — scan wizard flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the wizard from the primary CTA and shows the camera step", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => []),
    );

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    fireEvent.click(await screen.findByTestId("open-scan-wizard-button"));

    expect(await screen.findByTestId("scan-wizard")).toBeDefined();
    expect(await screen.findByTestId("camera-step")).toBeDefined();
    // Let the camera-permission effect settle before the test ends.
    await screen.findByTestId("camera-fallback-gallery-button");
  });

  it("closes the wizard when Escape is pressed", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => []),
    );

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );
    fireEvent.click(await screen.findByTestId("open-scan-wizard-button"));
    expect(await screen.findByTestId("scan-wizard")).toBeDefined();
    // Let the camera-permission effect settle before closing.
    await screen.findByTestId("camera-fallback-gallery-button");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("scan-wizard")).toBeNull();
    });
  });

  it("routes the camera fallback's gallery pick through the wizard's tracked upload, all the way to the auto-file card", async () => {
    let callCount = 0;
    const docId = "doc-wizard-1";
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => {
        callCount++;
        return callCount === 1 ? [] : [analyzedDoc(docId)];
      }),
    );
    vi.mocked(uploadFile).mockResolvedValue({
      document_id: docId,
      status: "uploaded",
    });
    vi.mocked(triggerOcr).mockResolvedValue({ status: "ocr_done", page_count: 1 });
    vi.mocked(fetchDocumentAnalysis).mockResolvedValue(analysis);

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    // Open the wizard; the camera is unavailable in jsdom, so the
    // fallback panel (with its own gallery shortcut) renders.
    fireEvent.click(await screen.findByTestId("open-scan-wizard-button"));
    const fallbackGalleryButton = await screen.findByTestId(
      "camera-fallback-gallery-button",
    );
    fireEvent.click(fallbackGalleryButton);

    // Picking a file routes through the wizard's dedicated gallery input.
    const wizardGalleryInput = screen.getByTestId(
      "wizard-gallery-input",
    ) as HTMLInputElement;
    const file = new File(["dummy"], "scan.jpg", { type: "image/jpeg" });
    fireEvent.change(wizardGalleryInput, { target: { files: [file] } });

    // The wizard now shows its processing step.
    expect(await screen.findByTestId("processing-step")).toBeDefined();

    // Once the tracked document reaches "analyzed", the wizard
    // auto-advances to the review step. The analysis is clean, so the
    // zero-touch auto-file card appears (not the manual summary).
    await waitFor(() => {
      expect(screen.getByTestId("review-step-autofile")).toBeDefined();
    });
  });
});
