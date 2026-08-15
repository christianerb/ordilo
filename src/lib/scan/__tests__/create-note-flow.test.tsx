import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Creating a note must feel instant.
 *
 * The save used to await, in one chain: the note POST, a router.refresh(),
 * a full list refetch, the LLM analyze POST, and another list refetch — all
 * while the sheet sat on "Wird gespeichert ...". These tests pin the new
 * contract: the sheet closes as soon as the note is stored, the note is on
 * screen right away, and the enrichment never blocks the user.
 */

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dokumente",
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/notes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notes")>(
    "@/lib/notes",
  );
  return { ...actual, createNote: vi.fn() };
});

import { ScanProvider, useScan, useScanActions } from "@/lib/scan/scan-context";
import { createClient } from "@/lib/supabase/client";
import { createNote } from "@/lib/notes";
import type { DocumentRow } from "@/lib/scan/scan-context-types";

const FAMILY_ID = "fam-note-0000-0000-0000-000000000001";
const NOTE_ID = "doc-note-1";

function storedNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    family_id: FAMILY_ID,
    uploaded_by: "user-1",
    title: "Steuer ID Hanna",
    document_type: "other",
    category: null,
    status: "confirmed",
    file_url: null,
    original_filename: null,
    mime_type: null,
    page_count: 1,
    summary: null,
    error_message: null,
    created_at: new Date().toISOString(),
    confirmed_at: null,
    source: "manual",
    ...overrides,
  } as unknown as DocumentRow;
}

/** Browser Supabase mock: one family, and a document list the test controls. */
function mockSupabaseClient(getDocuments: () => unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "families") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: { id: FAMILY_ID }, error: null }),
            })),
          })),
        };
      }
      if (table === "documents") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            order: vi
              .fn()
              .mockImplementation(async () => ({ data: getDocuments(), error: null })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as ReturnType<typeof createClient>;
}

/** Opens the note sheet and renders the provider's document titles. */
function NoteHarness() {
  const { openCreateNote } = useScanActions();
  const { documents } = useScan();
  return (
    <>
      <button type="button" onClick={() => openCreateNote()}>
        Notiz erstellen
      </button>
      <ul data-testid="doc-titles">
        {documents.map((doc) => (
          <li key={doc.id}>{doc.title}</li>
        ))}
      </ul>
    </>
  );
}

async function fillAndSubmitNote() {
  fireEvent.click(screen.getByText("Notiz erstellen"));
  fireEvent.change(await screen.findByTestId("note-title-input"), {
    target: { value: "Steuer ID Hanna" },
  });
  fireEvent.change(screen.getByTestId("note-editor-textarea"), {
    target: { value: "74 031 832 353" },
  });
  fireEvent.click(screen.getByTestId("note-submit-button"));
}

describe("create-note flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseClient(() => []),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes the sheet and shows the note without waiting for the analysis", async () => {
    vi.mocked(createNote).mockResolvedValue({
      document_id: NOTE_ID,
      status: "confirmed",
      server_pipeline: true,
      document: storedNoteRow(),
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    render(
      <ScanProvider initialFamilyId={FAMILY_ID}>
        <NoteHarness />
      </ScanProvider>,
    );

    await fillAndSubmitNote();

    // The sheet is gone …
    await waitFor(() => {
      expect(screen.queryByTestId("create-note-sheet")).toBeNull();
    });
    // … and the note is already on screen, from the row the save returned.
    expect(screen.getByText("Steuer ID Hanna")).toBeDefined();

    // The server queued the enrichment, so the client must not POST analyze.
    const analyzeCalls = fetchSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("/analyze"),
    );
    expect(analyzeCalls.length).toBe(0);
  });

  it("keeps the sheet open with an error when the save itself fails", async () => {
    vi.mocked(createNote).mockRejectedValue(
      new Error("Netzwerkfehler. Bitte Verbindung überprüfen."),
    );

    render(
      <ScanProvider initialFamilyId={FAMILY_ID}>
        <NoteHarness />
      </ScanProvider>,
    );

    await fillAndSubmitNote();

    const error = await screen.findByTestId("note-error");
    expect(error.textContent).toContain("Netzwerkfehler");
    expect(screen.queryByTestId("create-note-sheet")).not.toBeNull();
  });

  it("falls back to its own analyze call when the server could not queue one", async () => {
    vi.mocked(createNote).mockResolvedValue({
      document_id: NOTE_ID,
      status: "confirmed",
      server_pipeline: false,
      document: storedNoteRow(),
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    render(
      <ScanProvider initialFamilyId={FAMILY_ID}>
        <NoteHarness />
      </ScanProvider>,
    );

    await fillAndSubmitNote();

    // The sheet still closes immediately — the analyze call runs after it.
    await waitFor(() => {
      expect(screen.queryByTestId("create-note-sheet")).toBeNull();
    });
    await waitFor(() => {
      const analyzeCalls = fetchSpy.mock.calls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("/analyze"),
      );
      expect(analyzeCalls.length).toBe(1);
    });
  });
});
