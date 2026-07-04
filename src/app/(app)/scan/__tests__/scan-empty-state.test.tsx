import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

import ScanPage from "@/app/(app)/scan/page";
import { createClient } from "@/lib/supabase/client";

const FAMILY_ID = "fam-empty-0000-0000-0000-000000000001";

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

describe("ScanPage empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the warm empty state with an explicit CTA when there are no documents", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([]),
    );

    render(<ScanPage />);

    // The empty state should appear with the "Dokument hochladen" CTA.
    const cta = await screen.findByRole("button", {
      name: /dokument hochladen/i,
    });
    expect(cta).toBeDefined();

    // The warm empty-state container is present.
    expect(screen.getByTestId("empty-state")).toBeDefined();
    expect(screen.getByText("Noch keine Dokumente")).toBeDefined();
  });

  it("does not render the empty state when documents exist", async () => {
    const doc = {
      id: "doc-1",
      family_id: FAMILY_ID,
      uploaded_by: "user-1",
      title: "Rechnung",
      document_type: "invoice",
      category: null,
      status: "uploaded",
      file_url: `${FAMILY_ID}/doc-1/rechnung.pdf`,
      original_filename: "rechnung.pdf",
      mime_type: "application/pdf",
      page_count: null,
      ocr_text: null,
      summary: null,
      error_message: null,
      created_at: new Date().toISOString(),
      confirmed_at: null,
    };
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([doc]),
    );

    render(<ScanPage />);

    // Wait for the document list to render, then ensure the empty state
    // (and its CTA) are NOT shown.
    await screen.findByTestId("document-list");
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /dokument hochladen/i }),
    ).toBeNull();
  });

  it("clicking the empty-state CTA triggers the camera capture input", async () => {
    const client = mockSupabaseClient([]);
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    render(<ScanPage />);

    const cta = await screen.findByRole("button", {
      name: /dokument hochladen/i,
    });

    // The hidden camera input should exist and be programmatically
    // clickable. We spy on its click method.
    const cameraInput = screen.getByTestId("camera-input");
    const clickSpy = vi.spyOn(cameraInput, "click");

    fireEvent.click(cta);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
