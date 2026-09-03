import { documentTypeLabels, type DocumentType } from "./document-review";
import { resolveDocumentPeople, type MemberLike, type Person } from "./people";
import { getSupabase } from "./supabase";

export type LibraryDocument = {
  id: string;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  document_type: string | null;
  status: string;
  summary: string | null;
  ocr_text: string | null;
  source: string | null;
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
  "id, title, original_filename, mime_type, document_type, status, summary, ocr_text, source, created_at";

export function isManualNote(document: LibraryDocument): boolean {
  return document.source === "manual";
}

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

/**
 * Escapes user text for PostgREST's `or()` filter syntax. The result is
 * quoted so punctuation remains part of the ILIKE pattern instead of
 * being parsed as filter grammar.
 */
export function toLibrarySearchPattern(query: string): string {
  const escaped = query
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[%_]/g, "\\$&");

  return `"%${escaped}%"`;
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
    document.original_filename,
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

/** Status tone for a document row: only the non-final states speak up. */
export function getDocumentStatusTone(
  status: string,
): "new" | "processing" | "failed" | null {
  if (status === "analyzed") return "new";
  if (status === "failed") return "failed";
  if (status === "confirmed") return null;
  return "processing";
}

export interface LibraryDocumentGroup {
  key: string;
  /** "Diese Woche", "August 2026", or a letter for the title sort. */
  label: string;
  documents: LibraryDocument[];
}

/**
 * Groups a date-sorted list into weeks and months so a long library keeps
 * its bearings while scrolling; the title sort groups by first letter
 * instead. Groups are computed on the already-sorted list so the order
 * inside a group is never changed here.
 */
export function groupLibraryDocuments(
  documents: LibraryDocument[],
  sort: LibrarySort,
  now = new Date(),
): LibraryDocumentGroup[] {
  const groups: LibraryDocumentGroup[] = [];
  const push = (key: string, label: string, document: LibraryDocument) => {
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.documents.push(document);
      return;
    }
    groups.push({ key, label, documents: [document] });
  };

  if (sort === "title") {
    for (const document of documents) {
      const first = getDocumentTitle(document).trim()[0] ?? "#";
      const letter = /[a-zäöü]/i.test(first) ? first.toLocaleUpperCase("de") : "#";
      push(`letter-${letter}`, letter, document);
    }
    return groups;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const monthFormatter = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  });
  for (const document of documents) {
    const date = new Date(document.created_at);
    if (Number.isNaN(date.getTime())) {
      push("unknown", "Ohne Datum", document);
      continue;
    }
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (day >= weekAgo && day <= today) {
      push("this-week", "Diese Woche", document);
      continue;
    }
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    push(monthKey, monthFormatter.format(date), document);
  }
  return groups;
}

/**
 * The people named in a page of documents, keyed by document id. One
 * RLS-scoped read per page instead of one per row.
 */
export async function loadLibraryDocumentPeople(
  documentIds: string[],
  members: MemberLike[],
): Promise<Map<string, Person[]>> {
  const result = new Map<string, Person[]>();
  if (documentIds.length === 0) return result;
  const { data, error } = await getSupabase()
    .from("extracted_entities")
    .select("document_id, entity_value, linked_object_id")
    .eq("entity_type", "person")
    .in("document_id", documentIds);
  if (error || !data) return result;
  const byDocument = new Map<string, { entity_value: string; linked_object_id: string | null }[]>();
  for (const row of data as { document_id: string; entity_value: string; linked_object_id: string | null }[]) {
    const rows = byDocument.get(row.document_id) ?? [];
    rows.push(row);
    byDocument.set(row.document_id, rows);
  }
  for (const [documentId, rows] of byDocument) {
    result.set(documentId, resolveDocumentPeople(rows, members));
  }
  return result;
}
