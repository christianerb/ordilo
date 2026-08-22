import { documentTypeLabels, type DocumentType } from "./document-review";

export type LibraryDocument = {
  id: string;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  document_type: string | null;
  status: string;
  summary: string | null;
  ocr_text: string | null;
  created_at: string;
};

export type LibraryStatusFilter =
  | "all"
  | "needs_review"
  | "confirmed"
  | "processing"
  | "failed";

export type LibraryFilters = {
  query: string;
  status: LibraryStatusFilter;
  documentType: DocumentType | "all";
};

export type LibrarySort = "newest" | "oldest" | "title";

export const libraryPageSize = 25;

export const librarySortOptions: { value: LibrarySort; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "title", label: "Nach Name" },
];

type LibraryChange =
  | { type: "remove"; documentId: string }
  | { type: "refresh" };

const libraryChangeListeners = new Set<(change: LibraryChange) => void>();

/**
 * Keeps the mounted Ablage list in sync with a detail action without
 * persisting documents or sensitive data outside the RLS-backed database.
 */
export function subscribeToLibraryChanges(
  listener: (change: LibraryChange) => void,
): () => void {
  libraryChangeListeners.add(listener);
  return () => libraryChangeListeners.delete(listener);
}

export function removeLibraryDocumentOptimistically(documentId: string): void {
  for (const listener of libraryChangeListeners) {
    listener({ type: "remove", documentId });
  }
}

export function refreshLibraryDocuments(): void {
  for (const listener of libraryChangeListeners) {
    listener({ type: "refresh" });
  }
}

export const libraryDocumentSelect =
  "id, title, original_filename, mime_type, document_type, status, summary, ocr_text, created_at";

const documentTypes = new Set<DocumentType>([
  "invoice",
  "letter",
  "contract",
  "medical",
  "school",
  "insurance",
  "tax",
  "credentials",
  "note",
  "other",
]);

export const libraryStatusFilters: {
  value: LibraryStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "Alle" },
  { value: "needs_review", label: "Prüfen" },
  { value: "confirmed", label: "Gespeichert" },
  { value: "processing", label: "In Arbeit" },
  { value: "failed", label: "Fehler" },
];

export function getLibrarySortOrder(sort: LibrarySort): {
  column: "created_at" | "title";
  ascending: boolean;
} {
  switch (sort) {
    case "oldest":
      return { column: "created_at", ascending: true };
    case "title":
      return { column: "title", ascending: true };
    default:
      return { column: "created_at", ascending: false };
  }
}

export function getLibraryPageRange(
  page: number,
  pageSize = libraryPageSize,
): { from: number; to: number } {
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const from = safePage * safePageSize;
  return { from, to: from + safePageSize - 1 };
}

/** Keeps a paged list stable when the backend repeats a boundary row. */
export function mergeLibraryDocuments(
  current: LibraryDocument[],
  next: LibraryDocument[],
): LibraryDocument[] {
  const seen = new Set(current.map((document) => document.id));
  return [...current, ...next.filter((document) => !seen.has(document.id))];
}

export function getDocumentTitle(document: LibraryDocument): string {
  return document.title?.trim() || document.original_filename || "Dokument";
}

export function getDocumentTypeLabel(documentType: string | null): string | null {
  if (!documentType || !documentTypes.has(documentType as DocumentType)) return null;
  return documentTypeLabels[documentType as DocumentType];
}

export function getDocumentStatusGroup(status: string): LibraryStatusFilter {
  if (status === "analyzed") return "needs_review";
  if (status === "confirmed") return "confirmed";
  if (status === "failed") return "failed";
  return "processing";
}

export function getDocumentStatusLabel(status: string): string {
  switch (status) {
    case "confirmed":
      return "Gespeichert";
    case "analyzed":
      return "Bitte prüfen";
    case "failed":
      return "Nicht fertig";
    case "ocr_done":
    case "analyzing":
    case "ocr_processing":
      return "Wird vorbereitet";
    case "uploaded":
      return "Hochgeladen";
    default:
      return "Wird vorbereitet";
  }
}

export function getDocumentSearchText(document: LibraryDocument): string {
  return [
    getDocumentTitle(document),
    document.summary,
    document.ocr_text,
    getDocumentTypeLabel(document.document_type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("de");
}

export function filterLibraryDocuments(
  documents: LibraryDocument[],
  filters: LibraryFilters,
): LibraryDocument[] {
  const query = filters.query.trim().toLocaleLowerCase("de");

  return documents.filter((document) => {
    if (
      filters.status !== "all" &&
      getDocumentStatusGroup(document.status) !== filters.status
    ) {
      return false;
    }
    if (
      filters.documentType !== "all" &&
      document.document_type !== filters.documentType
    ) {
      return false;
    }
    return !query || getDocumentSearchText(document).includes(query);
  });
}

export function formatDocumentDate(
  value: string,
  now = new Date(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";

  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: target.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}
