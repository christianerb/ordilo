import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

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

import DokumentePage from "@/app/(app)/dokumente/page";
import { ScanProvider } from "@/lib/scan/scan-context";
import { CollectionsProvider } from "@/lib/collections/collections-context";
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

describe("DokumentePage empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Pretend prefers-reduced-motion is active so the CameraStep's
    // auto-capture sampler (which calls canvas.getContext, not
    // implemented in jsdom) doesn't start when the wizard opens.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the warm empty state with an explicit CTA when there are no documents", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient([]),
    );

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    // The empty state should appear with the "Dokument scannen" CTA.
    const cta = await screen.findByRole("button", {
      name: /dokument scannen/i,
    });
    expect(cta).toBeDefined();

    // The warm empty-state container is present.
    expect(screen.getByTestId("empty-state")).toBeDefined();
    expect(screen.getByText("Noch nichts gescannt")).toBeDefined();
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

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    // Wait for the document list to render, then ensure the empty state
    // (and its CTA) are NOT shown.
    await screen.findByTestId("document-list");
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /dokument scannen/i }),
    ).toBeNull();
  });

  it("clicking the empty-state CTA opens the scan wizard", async () => {
    const client = mockSupabaseClient([]);
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    const cta = await screen.findByRole("button", {
      name: /dokument scannen/i,
    });

    fireEvent.click(cta);

    expect(await screen.findByTestId("scan-wizard")).toBeDefined();
    expect(screen.getByTestId("camera-step")).toBeDefined();
  });

  it("keeps the document list visible during background polling for processing documents", async () => {
    vi.useFakeTimers();

    const doc = {
      id: "doc-processing",
      family_id: FAMILY_ID,
      uploaded_by: "user-1",
      title: "Rechnung in Arbeit",
      document_type: "invoice",
      category: null,
      status: "ocr_processing",
      file_url: `${FAMILY_ID}/doc-processing/rechnung.pdf`,
      original_filename: "rechnung.pdf",
      mime_type: "application/pdf",
      page_count: null,
      ocr_text: null,
      summary: null,
      error_message: null,
      created_at: new Date().toISOString(),
      confirmed_at: null,
    };

    let resolveBackgroundPoll:
      | ((value: { data: unknown[]; error: null }) => void)
      | null = null;

    const documentsChain = {
      eq: vi.fn().mockReturnThis(),
      order: vi
        .fn()
        .mockResolvedValueOnce({ data: [doc], error: null })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveBackgroundPoll = resolve;
            }),
        ),
    };
    const familiesChain = {
      limit: vi.fn(() => ({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: { id: FAMILY_ID }, error: null }),
      })),
    };

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
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
    } as unknown as ReturnType<typeof createClient>);

    render(
      <ScanProvider>
        <CollectionsProvider>
        <DokumentePage />
      </CollectionsProvider>
      </ScanProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("document-list")).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(screen.getByTestId("document-list")).toBeDefined();
    expect(screen.getByText("Rechnung in Arbeit")).toBeDefined();

    await act(async () => {
      resolveBackgroundPoll?.({ data: [doc], error: null });
      await Promise.resolve();
    });

    vi.useRealTimers();
  });
});
