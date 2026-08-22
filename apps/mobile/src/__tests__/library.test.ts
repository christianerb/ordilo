import {
  filterLibraryDocuments,
  formatDocumentDate,
  getLibraryPageRange,
  getLibrarySortOrder,
  getDocumentStatusGroup,
  getDocumentStatusLabel,
  getDocumentTitle,
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
});
