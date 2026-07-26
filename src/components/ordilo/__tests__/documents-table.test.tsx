import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Mock the entity-metadata fetcher so the table doesn't need a real
// supabase client — it's the only thing DocumentsTable pulls from
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

// Mock the analysis helpers used (indirectly, via the detail sheet's
// ReviewCard) when a row is clicked.
vi.mock("@/lib/analysis", () => ({
  fetchDocumentAnalysis: vi.fn(),
  fetchFamilyMembers: vi.fn().mockResolvedValue([]),
  fetchExistingCategories: vi.fn().mockResolvedValue([]),
}));

import { DocumentsTable } from "@/components/ordilo/documents-table";
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

/**
 * Both views render in jsdom because Tailwind breakpoints do not apply
 * there: the card list (phone) and the table (sm and up). Table assertions
 * therefore scope to the <table>, and the card list has its own block.
 */
function table() {
  return within(screen.getByRole("table"));
}

describe("DocumentsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenDocument.mockClear();
  });

  it("renders one row per document with its type, category, and date", async () => {
    const docs = [
      buildDoc({
        id: "doc-1",
        title: "Stromrechnung Juli",
        document_type: "invoice",
        category: "Energie",
      }),
    ];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({
      "doc-1": { persons: ["Emma"], tags: ["Strom"], documentDate: "2026-01-05" },
    });

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findByTestId("documents-table-row");
    const rowEl = table().getByText("Stromrechnung Juli").closest("tr")!;
    expect(within(rowEl).getByText("Rechnung")).toBeDefined();
    expect(within(rowEl).getByText("Energie")).toBeDefined();
    // Uses the resolved document date (05.01.2026), not created_at.
    expect(within(rowEl).getByText("05.01.2026")).toBeDefined();
  });

  it("falls back to created_at when a document has no extracted date", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Ohne Datum" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findByTestId("documents-table-row");
    const rowEl = table().getByText("Ohne Datum").closest("tr")!;
    expect(within(rowEl).getByText("10.01.2026")).toBeDefined();
  });

  it("filters rows by the free-text search input", async () => {
    const docs = [
      buildDoc({ id: "doc-1", title: "Stromrechnung" }),
      buildDoc({ id: "doc-2", title: "Kita-Brief" }),
    ];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findAllByTestId("documents-table-row");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "kita" },
    });

    expect(table().queryByText("Stromrechnung")).toBeNull();
    expect(table().getByText("Kita-Brief")).toBeDefined();
  });

  it("shows an empty-result message with a reset link when filters match nothing", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Dokument A" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findByTestId("documents-table-row");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "nichts-passt" },
    });

    await waitFor(() =>
      expect(table().getByText("Keine Dokumente gefunden.")).toBeDefined(),
    );

    fireEvent.click(screen.getByTestId("documents-filter-reset"));
    await waitFor(() => expect(table().getByText("Dokument A")).toBeDefined());
  });

  it("sorts by title when the column header is clicked", async () => {
    const docs = [
      buildDoc({ id: "doc-1", title: "Zebra" }),
      buildDoc({ id: "doc-2", title: "Anton" }),
    ];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findAllByTestId("documents-table-row");
    fireEvent.click(screen.getByTestId("sort-title"));

    const rows = screen.getAllByTestId("documents-table-row");
    expect(within(rows[0]).getByText("Anton")).toBeDefined();
    expect(within(rows[1]).getByText("Zebra")).toBeDefined();
  });

  it("paginates when there are more than 20 documents", async () => {
    const docs = Array.from({ length: 25 }, (_, i) =>
      buildDoc({ id: `doc-${i}`, title: `Dokument ${String(i).padStart(2, "0")}` }),
    );
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findAllByTestId("documents-table-row");
    expect(screen.getAllByTestId("documents-table-row")).toHaveLength(20);
    expect(screen.getByTestId("documents-table-page-info").textContent).toContain(
      "Seite 1 von 2",
    );

    fireEvent.click(screen.getByTestId("documents-table-next-page"));

    await waitFor(() => {
      expect(screen.getAllByTestId("documents-table-row")).toHaveLength(5);
    });
    expect(screen.getByTestId("documents-table-page-info").textContent).toContain(
      "Seite 2 von 2",
    );
  });

  it("opens the shared document sheet when a row is clicked", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Kita-Brief", status: "confirmed" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsTable documents={docs} />);

    await screen.findByTestId("documents-table-row");
    fireEvent.click(table().getByText("Kita-Brief").closest("tr")!);

    expect(mockOpenDocument).toHaveBeenCalledWith("doc-1");
  });

  it("shows the same documents as a card list on a phone", async () => {
    // The table needs 640px for Datum, Status and delete; on a 390px screen
    // that meant scrolling sideways inside a vertically scrolling page.
    const docs = [
      buildDoc({
        id: "doc-1",
        title: "Stromrechnung Juli",
        document_type: "invoice",
        category: "Energie",
      }),
    ];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsTable documents={docs} />);

    const card = await screen.findByTestId("documents-card");
    expect(within(card).getByText("Stromrechnung Juli")).toBeDefined();
    // Type, collection and date collapse into one secondary line.
    expect(within(card).getByText(/Rechnung/)).toBeDefined();
    expect(within(card).getByText(/Energie/)).toBeDefined();
  });

  it("opens a document from its card", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Kita-Brief" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsTable documents={docs} />);

    const card = await screen.findByTestId("documents-card");
    fireEvent.click(within(card).getByRole("button", { name: /öffnen/i }));
    expect(mockOpenDocument).toHaveBeenCalledWith("doc-1");
  });

  it("deletes from a card without opening the document", async () => {
    const onDelete = vi.fn();
    const docs = [buildDoc({ id: "doc-1", title: "Kita-Brief" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsTable documents={docs} onDelete={onDelete} />);

    fireEvent.click(await screen.findByTestId("documents-card-delete-doc-1"));
    expect(onDelete).toHaveBeenCalledWith("doc-1");
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });

  it("opens the shared document sheet when a focused row is activated with Enter", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Kita-Brief" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsTable documents={docs} />);

    const row = await screen.findByTestId("documents-table-row");
    fireEvent.keyDown(row, { key: "Enter" });

    expect(mockOpenDocument).toHaveBeenCalledWith("doc-1");
  });

  it("offers deletion without opening the document", async () => {
    const onDelete = vi.fn();
    const docs = [buildDoc({ id: "doc-1", title: "Kita-Brief" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsTable documents={docs} onDelete={onDelete} />);

    fireEvent.click(
      await screen.findByTestId("documents-table-delete-doc-1"),
    );

    expect(onDelete).toHaveBeenCalledWith("doc-1");
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });
});
