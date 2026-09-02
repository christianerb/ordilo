import {
  filterLibraryDocuments,
  formatDocumentDate,
  getLibraryPageRange,
  getLibrarySortOrder,
  toLibrarySearchPattern,
  getDocumentStatusGroup,
  getDocumentStatusLabel,
  getDocumentTitle,
  groupLibraryDocuments,
  getDocumentStatusTone,
  isManualNote,
  mergeLibraryDocuments,
  refreshLibraryDocuments,
  removeLibraryDocumentOptimistically,
  subscribeToLibraryChanges,
  type LibraryDocument,
} from "../lib/library";

const invoice: LibraryDocument = {
  id: "invoice",
  title: "Stromrechnung Juli",
  original_filename: "rechnung.pdf",
  mime_type: "application/pdf",
  document_type: "invoice",
  status: "confirmed",
  summary: "Rechnung für den Strom.",
  ocr_text: "Stadtwerke Juli",
  source: "upload",
  created_at: "2026-07-04T12:00:00.000Z",
};

const review: LibraryDocument = {
  ...invoice,
  id: "review",
  title: null,
  original_filename: "arztbrief.jpg",
  document_type: "medical",
  status: "analyzed",
  summary: "Termin bei der Kinderärztin.",
  ocr_text: "Kinderärztin Musterstadt",
};

describe("document library helpers", () => {
  it("uses a useful filename fallback and groups document states", () => {
    expect(getDocumentTitle(review)).toBe("arztbrief.jpg");
    expect(getDocumentStatusGroup("analyzed")).toBe("needs_review");
    expect(getDocumentStatusGroup("ocr_processing")).toBe("processing");
    expect(getDocumentStatusLabel("confirmed")).toBe("Gespeichert");
  });

  it("identifies manual notes for their dedicated detail route", () => {
    expect(isManualNote(invoice)).toBe(false);
    expect(isManualNote({ ...invoice, source: "manual" })).toBe(true);
  });

  it("combines German search, status, and type filters", () => {
    expect(
      filterLibraryDocuments([invoice, review], {
        query: "kinderärztin",
        status: "needs_review",
        documentType: "medical",
      }),
    ).toEqual([review]);

    expect(
      filterLibraryDocuments([invoice, review], {
        query: "stadtwerke",
        status: "all",
        documentType: "all",
      }),
    ).toEqual([invoice]);

    expect(
      filterLibraryDocuments(
        [{ ...invoice, title: "Monatliche Abrechnung" }],
        {
          query: "rechnung.pdf",
          status: "all",
          documentType: "all",
        },
      ),
    ).toHaveLength(1);
  });

  it("formats recent and older German dates without time-of-day noise", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    expect(formatDocumentDate("2026-07-05T00:01:00.000Z", now)).toBe("Heute");
    expect(formatDocumentDate("2026-07-04T12:00:00.000Z", now)).toBe("Gestern");
    expect(formatDocumentDate("2025-07-04T12:00:00.000Z", now)).toBe("4. Juli 2025");
  });

  it("maps mobile sort choices to explicit server ordering", () => {
    expect(getLibrarySortOrder("newest")).toEqual({
      column: "created_at",
      ascending: false,
    });
    expect(getLibrarySortOrder("oldest")).toEqual({
      column: "created_at",
      ascending: true,
    });
    expect(getLibrarySortOrder("title")).toEqual({
      column: "title",
      ascending: true,
    });
  });

  it("turns search text into a single safe PostgREST pattern", () => {
    expect(toLibrarySearchPattern("  Rechnung (Mai), 1.000  ")).toBe(
      '"%Rechnung (Mai), 1.000%"',
    );
    expect(toLibrarySearchPattern('  Kita "Süd", 100%_  ')).toBe(
      '"%Kita \\"Süd\\", 100\\%\\_%"',
    );
  });

  it("creates inclusive ranges and does not repeat boundary documents", () => {
    expect(getLibraryPageRange(0, 25)).toEqual({ from: 0, to: 24 });
    expect(getLibraryPageRange(2, 25)).toEqual({ from: 50, to: 74 });
    expect(getLibraryPageRange(-1, 0)).toEqual({ from: 0, to: 0 });

    expect(
      mergeLibraryDocuments([invoice, review], [{ ...invoice }, { ...review, id: "next" }]),
    ).toEqual([invoice, review, { ...review, id: "next" }]);
  });

  it("notifies the mounted list about optimistic removals and recovery refreshes", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToLibraryChanges(listener);

    removeLibraryDocumentOptimistically("invoice");
    refreshLibraryDocuments();
    unsubscribe();
    removeLibraryDocumentOptimistically("review");

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, { type: "remove", documentId: "invoice" });
    expect(listener).toHaveBeenNthCalledWith(2, { type: "refresh" });
  });

  it("groups date-sorted documents into this week and months", () => {
    const now = new Date(2026, 8, 2, 12);
    const doc = (id: string, created_at: string): LibraryDocument => ({
      ...invoice,
      id,
      created_at,
    });
    const groups = groupLibraryDocuments(
      [
        doc("a", "2026-09-02T08:00:00Z"),
        doc("b", "2026-08-28T08:00:00Z"),
        doc("c", "2026-08-12T08:00:00Z"),
        doc("d", "2026-07-30T08:00:00Z"),
      ],
      "newest",
      now,
    );
    expect(groups.map((group) => [group.label, group.documents.map((d) => d.id)])).toEqual([
      ["Diese Woche", ["a", "b"]],
      ["August 2026", ["c"]],
      ["Juli 2026", ["d"]],
    ]);
  });

  it("groups the title sort by first letter", () => {
    const doc = (id: string, title: string): LibraryDocument => ({ ...invoice, id, title });
    const groups = groupLibraryDocuments(
      [doc("1", "Arztbrief"), doc("2", "ärztliche Bescheinigung"), doc("3", "Bafög"), doc("4", "2026 Steuer")],
      "title",
    );
    expect(groups.map((group) => group.label)).toEqual(["A", "Ä", "B", "#"]);
  });

  it("only speaks up for non-final statuses", () => {
    expect(getDocumentStatusTone("confirmed")).toBeNull();
    expect(getDocumentStatusTone("analyzed")).toBe("new");
    expect(getDocumentStatusTone("ocr_processing")).toBe("processing");
    expect(getDocumentStatusTone("failed")).toBe("failed");
  });
});
