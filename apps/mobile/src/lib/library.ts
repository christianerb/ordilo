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
  personId: string | "all";
};

export type LibrarySort = "newest" | "oldest" | "title";

/**
 * What the family is looking for, not how it got in: a password is a
 * Zugang whether it was typed or scanned, and contacts sit beside the
 * paperwork they were read from.
 */
export type LibraryKind = "all" | "documents" | "notes" | "credentials" | "contacts";

export const libraryKindOptions: { value: LibraryKind; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "documents", label: "Dokumente" },
  { value: "notes", label: "Notizen" },
  { value: "credentials", label: "Zugänge" },
  { value: "contacts", label: "Kontakte" },
];

export type LibraryEntryGroup = Exclude<LibraryKind, "all" | "contacts">;

export function getLibraryEntryGroup(
  document: Pick<LibraryDocument, "document_type" | "source">,
): LibraryEntryGroup {
  if (document.document_type === "credentials") return "credentials";
  return document.source === "manual" ? "notes" : "documents";
}

/**
 * Kind and search folded into one PostgREST `or()` expression. Two
 * separate `.or()` calls would send two `or` parameters, and a plain
 * `neq` would drop rows whose type is still null while Ordilo reads them.
 */
export function buildLibraryFilterExpression(
  kind: LibraryKind,
  query: string,
): string | null {
  const notCredentials = "document_type.is.null,document_type.neq.credentials";
  const kindExpression =
    kind === "documents" || kind === "notes" ? notCredentials : null;
  let searchExpression: string | null = null;
  if (query.trim()) {
    const pattern = toLibrarySearchPattern(query);
    searchExpression = `title.ilike.${pattern},original_filename.ilike.${pattern},summary.ilike.${pattern},ocr_text.ilike.${pattern}`;
  }
  if (kindExpression && searchExpression) {
    return `and(or(${kindExpression}),or(${searchExpression}))`;
  }
  return kindExpression ?? searchExpression;
}

const COUNT_WORDS: Record<LibraryKind, [string, string]> = {
  all: ["Eintrag", "Einträge"],
  documents: ["Dokument", "Dokumente"],
  notes: ["Notiz", "Notizen"],
  credentials: ["Zugang", "Zugänge"],
  contacts: ["Kontakt", "Kontakte"],
};

/** "128 Einträge", "1 Notiz"; a search or filter counts "Treffer" instead. */
export function formatLibraryCount(
  kind: LibraryKind,
  count: number,
  { filtered = false, more = false } = {},
): string {
  const suffix = more ? "+" : "";
  if (filtered) return `${count}${suffix} Treffer`;
  const [one, many] = COUNT_WORDS[kind];
  return `${count}${suffix} ${count === 1 && !more ? one : many}`;
}

export const libraryPageSize = 25;

/**
 * PostgREST answers at most this many rows per request (Supabase's
 * default max-rows), so longer reads are split into several ranges.
 */
export const libraryMaxRowsPerRequest = 1000;

/** Row ranges of at most `chunk` rows that together cover 0…count-1. */
export function getLibraryChunkRanges(
  count: number,
  chunk = libraryMaxRowsPerRequest,
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  const size = Math.max(1, Math.floor(chunk));
  for (let from = 0; from < count; from += size) {
    ranges.push({ from, to: Math.min(count, from + size) - 1 });
  }
  return ranges;
}

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
  { value: "needs_review", label: "Zu prüfen" },
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

export function getDocumentTitle(
  document: Pick<LibraryDocument, "original_filename" | "title">,
): string {
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

type GroupableRow = Pick<LibraryDocument, "created_at" | "original_filename" | "title">;

/**
 * The group one row falls into: "Diese Woche", a month, or a first letter
 * for the title sort. Shared by the list and the month jump so both agree
 * on where a group starts.
 */
export function getLibraryGroup(
  row: GroupableRow,
  sort: LibrarySort,
  now = new Date(),
): { key: string; label: string } {
  if (sort === "title") {
    const first = (getDocumentTitle(row).trim()[0] ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const letter = /[a-z]/i.test(first) ? first.toLocaleUpperCase("de") : "#";
    return { key: `letter-${letter}`, label: letter };
  }
  const date = new Date(row.created_at);
  if (Number.isNaN(date.getTime())) return { key: "unknown", label: "Ohne Datum" };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (day >= weekAgo && day <= today) return { key: "this-week", label: "Diese Woche" };
  return {
    key: `${date.getFullYear()}-${date.getMonth()}`,
    label: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date),
  };
}

/**
 * Groups a sorted list into weeks and months so a long library keeps its
 * bearings while scrolling; the title sort groups by first letter
 * instead. Groups are computed on the already-sorted list so the order
 * inside a group is never changed here.
 */
export function groupLibraryDocuments(
  documents: LibraryDocument[],
  sort: LibrarySort,
  now = new Date(),
): LibraryDocumentGroup[] {
  const groups: LibraryDocumentGroup[] = [];
  const runKey = createRunKeys();
  let lastBase: string | null = null;
  for (const document of documents) {
    const { key, label } = getLibraryGroup(document, sort, now);
    const last = groups[groups.length - 1];
    if (last && lastBase === key) last.documents.push(document);
    else groups.push({ key: runKey(key), label, documents: [document] });
    lastBase = key;
  }
  return groups;
}

/**
 * The database's collation decides where "Ärger", "é" or untitled rows
 * land, so the same group can appear twice in one run of rows. The
 * second run gets its own key; list and jump index number runs the same
 * way because the loaded rows are always a prefix of the full result.
 */
function createRunKeys(): (key: string) => string {
  const seen = new Map<string, number>();
  return (key) => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key}~${count}`;
  };
}

export interface LibraryJumpTarget {
  /** Same key as the list group it jumps to. */
  groupKey: string;
  label: string;
  count: number;
  /** Position of the group's first row in the full, sorted result. */
  offset: number;
}

/** The columns a jump index needs: enough to group, nothing to read. */
export const libraryJumpSelect = "created_at, title, original_filename";

/**
 * Every group of the full result, not only the loaded pages, so a family
 * with two years of paperwork can go straight to "März 2025".
 */
export function buildLibraryJumpTargets(
  rows: GroupableRow[],
  sort: LibrarySort,
  now = new Date(),
): LibraryJumpTarget[] {
  const targets: LibraryJumpTarget[] = [];
  const runKey = createRunKeys();
  let lastBase: string | null = null;
  rows.forEach((row, index) => {
    const { key, label } = getLibraryGroup(row, sort, now);
    const last = targets[targets.length - 1];
    if (last && lastBase === key) last.count += 1;
    else targets.push({ groupKey: runKey(key), label, count: 1, offset: index });
    lastBase = key;
  });
  return targets;
}

/** How many rows to load so a jump target's whole first page is present. */
export function getLibraryRowsThrough(offset: number, pageSize = libraryPageSize): number {
  return (Math.floor(Math.max(0, offset) / pageSize) + 2) * pageSize;
}

export type LibraryListItem =
  | {
      type: "header";
      key: string;
      groupKey: string;
      label: string;
      /** Position of the group's first row among all rows. */
      offset: number;
    }
  | {
      type: "row";
      key: string;
      groupKey: string;
      document: LibraryDocument;
      first: boolean;
      last: boolean;
    };

/**
 * One flat list for a virtualized FlatList: a header item per group (the
 * sticky ones) followed by its rows, each row knowing whether it opens or
 * closes its group's card.
 */
export function flattenLibraryGroups(groups: LibraryDocumentGroup[]): {
  items: LibraryListItem[];
  stickyIndices: number[];
} {
  const items: LibraryListItem[] = [];
  const stickyIndices: number[] = [];
  let offset = 0;
  for (const group of groups) {
    stickyIndices.push(items.length);
    items.push({
      type: "header",
      key: `header-${group.key}`,
      groupKey: group.key,
      label: group.label,
      offset,
    });
    offset += group.documents.length;
    group.documents.forEach((document, index) => {
      items.push({
        type: "row",
        key: document.id,
        groupKey: group.key,
        document,
        first: index === 0,
        last: index === group.documents.length - 1,
      });
    });
  }
  return { items, stickyIndices };
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

/** Resolves one family member to the documents that explicitly link them. */
export async function loadLibraryDocumentIdsForPerson(
  familyId: string,
  personId: string,
): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("extracted_entities")
    .select("document_id")
    .eq("family_id", familyId)
    .eq("entity_type", "person")
    .eq("linked_object_id", personId);
  if (error) throw error;
  return [
    ...new Set(
      (data ?? []).map((row: { document_id: string }) => row.document_id),
    ),
  ];
}
