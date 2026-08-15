import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Mock the entity-metadata fetcher so the list doesn't need a real
// supabase client — it's the only thing DocumentsBrowser pulls from
// "@/lib/documents-table" beyond types.
vi.mock("@/lib/documents-table", () => ({
  fetchDocumentsTableMeta: vi.fn(),
}));
const mockOpenDocument = vi.fn();
vi.mock("@/lib/scan/scan-context", () => ({
  useDocumentViewer: () => ({
    openDocument: mockOpenDocument,
  }),
}));

// The collection chips and the colored tiles read from the collections
// provider; stub it so the list can be rendered on its own.
const mockCollections = [
  { id: "col-1", name: "Rechnungen", icon: "receipt", color: "petrol" },
  { id: "col-2", name: "Kita", icon: "graduation-cap", color: "apricot" },
];
vi.mock("@/lib/collections/collections-context", () => ({
  useCollections: () => ({ collections: mockCollections, addCollection: vi.fn() }),
}));

import { DocumentsBrowser } from "@/components/ordilo/documents-browser";
import { fetchDocumentsTableMeta } from "@/lib/documents-table";
import type { Database } from "@/types/database";

type DocRow = Database["public"]["Tables"]["documents"]["Row"];

const FAMILY_ID = "fam-table-0000-0000-0000-000000000001";

function buildDoc(overrides: Partial<DocRow> & { id: string }): DocRow {
  return {
    family_id: FAMILY_ID,
    uploaded_by: "user-1",
    title: "Dokument",
    document_type: "other",
    category: null,
    status: "confirmed",
    file_url: `${FAMILY_ID}/${overrides.id}/file.pdf`,
    original_filename: "file.pdf",
    mime_type: "application/pdf",
    page_count: null,
    ocr_text: null,
    summary: null,
    error_message: null,
    created_at: "2026-01-10T12:00:00Z",
    confirmed_at: "2026-01-10T12:05:00Z",
    ...overrides,
  } as DocRow;
}

function rows() {
  return screen.getAllByTestId("documents-row");
}

describe("DocumentsBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenDocument.mockClear();
  });

  it("renders one row per document with its type, date, and status", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({
      "doc-1": { persons: [], tags: [], documentDate: "2026-02-03" },
    });

    render(
      <DocumentsBrowser
        documents={[
          buildDoc({
            id: "doc-1",
            title: "Stromrechnung",
            document_type: "invoice",
            category: "Rechnungen",
          }),
        ]}
      />,
    );

    const row = await screen.findByTestId("documents-row");
    expect(within(row).getByText("Stromrechnung")).toBeDefined();
    expect(within(row).getByText("Rechnung")).toBeDefined();
    await waitFor(() => {
      expect(within(row).getByText("03.02.2026")).toBeDefined();
    });
    expect(within(row).getByText("Im Familienbuch")).toBeDefined();
  });

  it("falls back to created_at when a document has no extracted date", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsBrowser
        documents={[buildDoc({ id: "doc-1", created_at: "2026-03-05T08:00:00Z" })]}
      />,
    );

    const row = await screen.findByTestId("documents-row");
    expect(within(row).getByText("05.03.2026")).toBeDefined();
  });

  it("filters rows by the free-text search input", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsBrowser
        documents={[
          buildDoc({ id: "doc-1", title: "Stromrechnung" }),
          buildDoc({ id: "doc-2", title: "Kita-Vertrag" }),
        ]}
      />,
    );

    await screen.findAllByTestId("documents-row");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "kita" },
    });

    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Kita-Vertrag")).toBeDefined();
  });

  it("filters by a collection chip and clears again with 'Alle'", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsBrowser
        documents={[
          buildDoc({ id: "doc-1", title: "Stromrechnung", category: "Rechnungen" }),
          buildDoc({ id: "doc-2", title: "Kita-Brief", category: "Kita" }),
        ]}
      />,
    );

    await screen.findAllByTestId("documents-row");
    fireEvent.click(screen.getByTestId("documents-chip-col-2"));

    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Kita-Brief")).toBeDefined();

    fireEvent.click(screen.getByTestId("documents-chip-all"));
    expect(rows()).toHaveLength(2);
  });

  it("shows an empty-result message with a reset link when filters match nothing", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsBrowser documents={[buildDoc({ id: "doc-1", title: "Stromrechnung" })]} />);

    await screen.findByTestId("documents-row");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "zzz" },
    });

    expect(screen.getByText("Keine Dokumente gefunden.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Alles wieder zeigen" }));
    expect(rows()).toHaveLength(1);
  });

  it("sorts by title and back to newest first", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsBrowser
        documents={[
          buildDoc({ id: "doc-1", title: "Zahnarzt", created_at: "2026-01-02T10:00:00Z" }),
          buildDoc({ id: "doc-2", title: "Ampel", created_at: "2026-01-01T10:00:00Z" }),
        ]}
      />,
    );

    await screen.findAllByTestId("documents-row");
    // Default: newest first.
    expect(rows()[0].textContent).toContain("Zahnarzt");

    fireEvent.change(screen.getByTestId("documents-sort"), {
      target: { value: "title" },
    });
    expect(rows()[0].textContent).toContain("Ampel");

    fireEvent.change(screen.getByTestId("documents-sort"), {
      target: { value: "oldest" },
    });
    expect(rows()[0].textContent).toContain("Ampel");
  });

  it("paginates when there are more than 20 documents", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    const docs = Array.from({ length: 25 }, (_, i) =>
      buildDoc({
        id: `doc-${i}`,
        title: `Dokument ${i}`,
        created_at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      }),
    );

    render(<DocumentsBrowser documents={docs} />);

    await screen.findAllByTestId("documents-row");
    expect(rows()).toHaveLength(20);
    expect(screen.getByTestId("documents-page-info").textContent).toContain(
      "Seite 1 von 2",
    );

    fireEvent.click(screen.getByTestId("documents-next-page"));
    await waitFor(() => {
      expect(rows()).toHaveLength(5);
    });
    expect(screen.getByTestId("documents-page-info").textContent).toContain(
      "Seite 2 von 2",
    );
  });

  it("opens the shared document sheet when a row is clicked", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsBrowser documents={[buildDoc({ id: "doc-1", title: "Stromrechnung" })]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Stromrechnung öffnen" }));
    expect(mockOpenDocument).toHaveBeenCalledWith("doc-1");
  });

  it("offers deletion from the row menu without opening the document", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});
    const onDelete = vi.fn();

    render(
      <DocumentsBrowser
        documents={[buildDoc({ id: "doc-1", title: "Stromrechnung" })]}
        onDelete={onDelete}
      />,
    );

    // Radix opens the menu on pointerdown/keyboard, not on a synthetic
    // click — the keyboard path doubles as the a11y check.
    fireEvent.keyDown(await screen.findByTestId("documents-row-menu-doc-1"), {
      key: "Enter",
    });
    fireEvent.click(await screen.findByTestId("documents-row-delete-doc-1"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("doc-1");
    });
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });

  it("shows the recently added rail only for an unfiltered, longer list", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    const docs = Array.from({ length: 8 }, (_, i) =>
      buildDoc({
        id: `doc-${i}`,
        title: `Dokument ${i}`,
        created_at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      }),
    );

    const { rerender } = render(<DocumentsBrowser documents={docs} />);

    await screen.findAllByTestId("documents-row");
    expect(screen.getAllByTestId("documents-recent-card")).toHaveLength(6);
    // Newest first.
    expect(screen.getAllByTestId("documents-recent-card")[0].textContent).toContain(
      "Dokument 7",
    );

    // Searching turns the whole screen into a result list — no rail.
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "Dokument 1" },
    });
    expect(screen.queryByTestId("documents-recent")).toBeNull();

    // A short library has nothing to shortcut to either.
    rerender(<DocumentsBrowser documents={docs.slice(0, 3)} />);
    expect(screen.queryByTestId("documents-recent")).toBeNull();
  });

  it("hands the typed text to Ordilo instead of searching, when asked", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsBrowser documents={[buildDoc({ id: "doc-1" })]} />);

    await screen.findByTestId("documents-row");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "Was kostet die Kita?" },
    });

    expect(
      screen.getByTestId("documents-ask-ordilo").getAttribute("href"),
    ).toBe("/suche?q=Was%20kostet%20die%20Kita%3F");
  });

  it("fetches metadata only for documents it has not loaded yet", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    const { rerender } = render(
      <DocumentsBrowser documents={[buildDoc({ id: "doc-1" })]} />,
    );

    await waitFor(() => {
      expect(fetchDocumentsTableMeta).toHaveBeenCalledWith(["doc-1"]);
    });

    rerender(
      <DocumentsBrowser
        documents={[buildDoc({ id: "doc-1" }), buildDoc({ id: "doc-2" })]}
      />,
    );

    await waitFor(() => {
      expect(fetchDocumentsTableMeta).toHaveBeenLastCalledWith(["doc-2"]);
    });
    expect(fetchDocumentsTableMeta).toHaveBeenCalledTimes(2);
  });

  it("keeps filter and sort state when the document set changes", async () => {
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    const { rerender } = render(
      <DocumentsBrowser
        documents={[
          buildDoc({ id: "doc-1", title: "Stromrechnung" }),
          buildDoc({ id: "doc-2", title: "Kita-Vertrag" }),
        ]}
      />,
    );

    await screen.findAllByTestId("documents-row");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "kita" },
    });
    expect(rows()).toHaveLength(1);

    rerender(
      <DocumentsBrowser
        documents={[
          buildDoc({ id: "doc-1", title: "Stromrechnung" }),
          buildDoc({ id: "doc-2", title: "Kita-Vertrag" }),
          buildDoc({ id: "doc-3", title: "Kita-Beitrag" }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    expect(
      (screen.getByTestId("documents-search-input") as HTMLInputElement).value,
    ).toBe("kita");
  });
});
