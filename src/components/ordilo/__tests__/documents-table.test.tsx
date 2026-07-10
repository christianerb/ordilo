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

describe("DocumentsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenDocument.mockClear();
  });

  it("renders one row per document with its persons, category, and tags", async () => {
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

    const row = await screen.findByText("Stromrechnung Juli");
    const rowEl = row.closest("tr")!;
    expect(within(rowEl).getByText("Emma")).toBeDefined();
    expect(within(rowEl).getByText("Energie")).toBeDefined();
    expect(within(rowEl).getByText("Strom")).toBeDefined();
    // Uses the resolved document date (05.01.2026), not created_at.
    expect(within(rowEl).getByText("05.01.2026")).toBeDefined();
  });

  it("falls back to created_at when a document has no extracted date", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Ohne Datum" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    const row = await screen.findByText("Ohne Datum");
    expect(within(row.closest("tr")!).getByText("10.01.2026")).toBeDefined();
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

    await screen.findByText("Stromrechnung");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "kita" },
    });

    expect(screen.queryByText("Stromrechnung")).toBeNull();
    expect(screen.getByText("Kita-Brief")).toBeDefined();
  });

  it("filters rows by person", async () => {
    const docs = [
      buildDoc({ id: "doc-1", title: "Dokument A" }),
      buildDoc({ id: "doc-2", title: "Dokument B" }),
    ];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({
      "doc-1": { persons: ["Emma"], tags: [], documentDate: null },
      "doc-2": { persons: ["Papa"], tags: [], documentDate: null },
    });

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findByText("Dokument A");
    fireEvent.change(screen.getByTestId("documents-filter-person"), {
      target: { value: "Papa" },
    });

    expect(screen.queryByText("Dokument A")).toBeNull();
    expect(screen.getByText("Dokument B")).toBeDefined();
  });

  it("shows an empty-result message with a reset link when filters match nothing", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Dokument A" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findByText("Dokument A");
    fireEvent.change(screen.getByTestId("documents-search-input"), {
      target: { value: "nichts-passt" },
    });

    expect(await screen.findByText("Keine Dokumente gefunden.")).toBeDefined();

    fireEvent.click(screen.getByTestId("documents-filter-reset"));
    expect(await screen.findByText("Dokument A")).toBeDefined();
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

    await screen.findByText("Zebra");
    fireEvent.click(screen.getByTestId("sort-title"));

    const rows = screen.getAllByTestId("documents-table-row");
    expect(within(rows[0]).getByText("Anton")).toBeDefined();
    expect(within(rows[1]).getByText("Zebra")).toBeDefined();
  });

  it("paginates when there are more than 15 documents", async () => {
    const docs = Array.from({ length: 18 }, (_, i) =>
      buildDoc({ id: `doc-${i}`, title: `Dokument ${String(i).padStart(2, "0")}` }),
    );
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(
      <DocumentsTable documents={docs} />,
    );

    await screen.findByText("Dokument 00");
    expect(screen.getAllByTestId("documents-table-row")).toHaveLength(15);
    expect(screen.getByTestId("documents-table-page-info").textContent).toContain(
      "Seite 1 von 2",
    );

    fireEvent.click(screen.getByTestId("documents-table-next-page"));

    await waitFor(() => {
      expect(screen.getAllByTestId("documents-table-row")).toHaveLength(3);
    });
    expect(screen.getByTestId("documents-table-page-info").textContent).toContain(
      "Seite 2 von 2",
    );
  });

  it("opens the shared document sheet when a row is clicked", async () => {
    const docs = [buildDoc({ id: "doc-1", title: "Kita-Brief", status: "confirmed" })];
    vi.mocked(fetchDocumentsTableMeta).mockResolvedValue({});

    render(<DocumentsTable documents={docs} />);

    const row = await screen.findByText("Kita-Brief");
    fireEvent.click(row.closest("tr")!);

    expect(mockOpenDocument).toHaveBeenCalledWith("doc-1");
  });
});
