import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mock the supabase browser client and the upload/ocr helpers so the
// page can render without network calls.
// The scan provider calls router.refresh() after a confirmed review so the
// server components (home's first-visit state) pick the new document up.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dokumente",
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/upload", () => ({
  uploadFile: vi.fn(),
}));
vi.mock("@/lib/ocr", () => ({
  triggerOcr: vi.fn(),
}));

import { DokumenteClient } from "@/app/(app)/dokumente/dokumente-client";
import { ScanProvider } from "@/lib/scan/scan-context";
import { CollectionsProvider } from "@/lib/collections/collections-context";
import { createClient } from "@/lib/supabase/client";
import type { DocumentRow } from "@/lib/scan/scan-context-types";

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
        <DokumenteClient initialDocuments={[]} />
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
        <DokumenteClient initialDocuments={[doc as unknown as DocumentRow]} />
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
        <DokumenteClient initialDocuments={[]} />
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
        <DokumenteClient initialDocuments={[doc as unknown as DocumentRow]} />
      </CollectionsProvider>
      </ScanProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Seeded from the server-rendered list — visible without any fetch.
    expect(screen.getByTestId("document-list")).toBeDefined();

    // The first background poll fires after 4.5s: realtime is unavailable
    // with this mock client, so the safety-net heartbeat runs at the
    // 3-tick cadence (3 × 1.5s) instead of the old every-tick polling.
    await act(async () => {
      vi.advanceTimersByTime(4500);
      await Promise.resolve();
    });

    expect(screen.getByTestId("document-list")).toBeDefined();
    // The phone card list and the table both render in jsdom, so the title
    // legitimately appears twice.
    expect(screen.getAllByText("Rechnung in Arbeit").length).toBeGreaterThan(0);

    // The next poll stays in flight — the list must not unmount while a
    // background refresh is pending.
    await act(async () => {
      vi.advanceTimersByTime(4500);
      await Promise.resolve();
    });

    expect(screen.getByTestId("document-list")).toBeDefined();

    await act(async () => {
      resolveBackgroundPoll?.({ data: [doc], error: null });
      await Promise.resolve();
    });

    expect(screen.getByTestId("document-list")).toBeDefined();

    vi.useRealTimers();
  });

  it("renders server-provided initial documents immediately without refetching the table", async () => {
    // Hybrid SSR: page.tsx fetches the documents server-side and passes
    // them as initialDocuments; the client seeds the ScanProvider with
    // them instead of running the identical full-table query again.
    const ssrDoc = {
      id: "doc-ssr",
      family_id: FAMILY_ID,
      uploaded_by: "user-1",
      title: "SSR-Rechnung",
      document_type: "invoice",
      category: null,
      status: "confirmed",
      file_url: `${FAMILY_ID}/doc-ssr/rechnung.pdf`,
      original_filename: "rechnung.pdf",
      mime_type: "application/pdf",
      page_count: null,
      ocr_text: null,
      summary: null,
      error_message: null,
      created_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    } as unknown as DocumentRow;

    // If the client refetched on mount, this query would be called — the
    // never-resolving promise would also keep the provider "loading"
    // forever, so both signals guard against the double-fetch regression.
    const documentsOrderSpy = vi
      .fn()
      .mockReturnValue(new Promise(() => {}));
    const documentsChain = {
      eq: vi.fn().mockReturnThis(),
      order: documentsOrderSpy,
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
          <DokumenteClient initialDocuments={[ssrDoc]} />
        </CollectionsProvider>
      </ScanProvider>,
    );

    // Let the provider's mount effects (family resolution) settle.
    await act(async () => {
      await Promise.resolve();
    });

    // No spinner, no empty state — the SSR document is on screen.
    expect(screen.getByTestId("document-list")).toBeDefined();
    expect(screen.getAllByText("SSR-Rechnung").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("empty-state")).toBeNull();

    // The duplicate full-table fetch must NOT have fired.
    expect(documentsOrderSpy).not.toHaveBeenCalled();
  });

  it("heartbeat refetches only the processing documents, never the whole table", async () => {
    vi.useFakeTimers();

    const processingDoc = {
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
    const confirmedDoc = {
      ...processingDoc,
      id: "doc-confirmed",
      title: "Alte Rechnung",
      status: "confirmed",
    };

    // fetchDocuments filters by family_id; the delta heartbeat fetches by
    // document id. Spying on eq() tells the two apart.
    const eqSpy = vi.fn().mockReturnThis();
    const documentsChain = {
      eq: eqSpy,
      order: vi.fn().mockResolvedValue({ data: [processingDoc], error: null }),
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
          <DokumenteClient
            initialDocuments={[
              processingDoc as unknown as DocumentRow,
              confirmedDoc as unknown as DocumentRow,
            ]}
          />
        </CollectionsProvider>
      </ScanProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("document-list")).toBeDefined();

    // First heartbeat: realtime is unavailable with this mock client, so
    // the safety net fires at the 3-tick cadence (3 × 1.5s).
    await act(async () => {
      vi.advanceTimersByTime(4500);
      await Promise.resolve();
    });

    const eqCalls = eqSpy.mock.calls.map((call) => call[0]);
    // Delta fetch by document id for the processing doc…
    expect(eqSpy).toHaveBeenCalledWith("id", "doc-processing");
    // …never a full-table fetch by family id…
    expect(eqCalls).not.toContain("family_id");
    // …and never a fetch for the settled confirmed doc.
    expect(eqSpy).not.toHaveBeenCalledWith("id", "doc-confirmed");

    vi.useRealTimers();
  });
});
