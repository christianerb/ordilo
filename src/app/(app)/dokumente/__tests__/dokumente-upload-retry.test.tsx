import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the supabase browser client and the upload/ocr helpers so the
// page can render without network calls.
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
vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn().mockResolvedValue([]),
  fetchExistingCategories: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/documents-table", () => ({
  fetchDocumentsTableMeta: vi.fn().mockResolvedValue({}),
}));

import { DokumenteClient } from "@/app/(app)/dokumente/dokumente-client";
import { ScanProvider } from "@/lib/scan/scan-context";
import { CollectionsProvider } from "@/lib/collections/collections-context";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";

const FAMILY_ID = "fam-retry-0000-0000-0000-000000000001";

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

describe("DokumentePage — upload retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent auto-switch to table view (desktop default) in jsdom.
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
  });

  it("re-uploads exactly once per retry click, even under StrictMode", async () => {
    // Regression test: handleRetry used to call handleFileUpload INSIDE
    // the setUploads updater. Updaters must be pure — StrictMode
    // double-invokes them, so one click on "Nochmal versuchen" uploaded
    // the same file twice. Rendering in StrictMode here exercises that
    // double-invoke; a pure updater makes it harmless.
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => []),
    );
    // Every upload attempt fails, so the progress card shows its retry
    // button after each attempt.
    vi.mocked(uploadFile).mockRejectedValue(new Error("Netzwerkfehler"));

    render(
      <StrictMode>
        <ScanProvider>
          <CollectionsProvider>
            <DokumenteClient initialDocuments={[]} />
          </CollectionsProvider>
        </ScanProvider>
      </StrictMode>,
    );

    await screen.findByTestId("empty-state");

    // Upload a file via the camera input; it fails and shows the error
    // card with the retry button.
    const cameraInput = screen.getByTestId("camera-input") as HTMLInputElement;
    const file = new File(["dummy"], "brief.jpg", { type: "image/jpeg" });
    fireEvent.change(cameraInput, { target: { files: [file] } });

    const retryButton = await screen.findByRole("button", {
      name: /nochmal versuchen/i,
    });
    expect(vi.mocked(uploadFile).mock.calls.length).toBe(1);

    fireEvent.click(retryButton);

    // The retry re-runs the whole upload (which fails again). Wait for
    // the new attempt, then give a hypothetical double-invoked updater
    // time to fire a duplicate — none may appear.
    await waitFor(() => {
      expect(vi.mocked(uploadFile).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Exactly one new upload attempt, and exactly one error card.
    expect(vi.mocked(uploadFile).mock.calls.length).toBe(2);
    expect(screen.getAllByTestId(/^upload-card-/).length).toBe(1);
  });

  it("accepts a file dropped over the page header", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => []),
    );
    vi.mocked(uploadFile).mockRejectedValue(new Error("Netzwerkfehler"));

    render(
      <ScanProvider>
        <CollectionsProvider>
          <DokumenteClient initialDocuments={[]} />
        </CollectionsProvider>
      </ScanProvider>,
    );

    await screen.findByTestId("empty-state");
    const file = new File(["dummy"], "brief.pdf", {
      type: "application/pdf",
    });

    fireEvent.drop(screen.getByRole("banner"), {
      dataTransfer: {
        files: [file],
        types: ["Files"],
      },
    });

    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledTimes(1);
    });
    expect(uploadFile).toHaveBeenCalledWith(
      file,
      FAMILY_ID,
      expect.any(Function),
    );
  });
});
