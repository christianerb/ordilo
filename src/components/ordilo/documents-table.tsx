"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Table2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";
import {
  getStatusLabel,
  getStatusBadgeClasses,
  getFileIcon,
} from "@/lib/schemas/document";
import { DOCUMENT_TYPE_LABELS } from "@/lib/schemas/extraction";
import { fetchDocumentsTableMeta } from "@/lib/documents-table";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { useDocumentViewer } from "@/lib/scan/scan-context";
import type { Database } from "@/types/database";

type DocRow = Database["public"]["Tables"]["documents"]["Row"];

const PAGE_SIZE = 15;

type SortColumn = "title" | "type" | "category" | "date" | "status";
type SortDirection = "asc" | "desc";

interface EnrichedRow {
  doc: DocRow;
  displayTitle: string;
  typeLabel: string;
  persons: string[];
  tags: string[];
  category: string | null;
  /** The document's own date (earliest extracted date entity), falling back to created_at. */
  resolvedDate: string;
}

function summarizeValues(values: string[]) {
  if (values.length === 0) return null;
  return {
    first: values[0],
    remaining: values.length - 1,
  };
}

function getCompactStatusLabel(status: string) {
  switch (status) {
    case "confirmed":
      return "Bestätigt";
    case "uploaded":
      return "Neu";
    case "ocr_processing":
      return "Läuft";
    case "ocr_done":
    case "analyzed":
      return "Prüfen";
    case "analyzing":
      return "Sortiert";
    case "failed":
      return "Fehler";
    default:
      return getStatusLabel(status);
  }
}

/**
 * Documents Table — a filterable, sortable, paginated table view of the
 * family's documents, as an alternative to the folder/card browsing mode.
 *
 * Fetches person/tag/date metadata for the given documents once on mount
 * (in one query) and layers client-side search, filters, sorting, and
 * pagination on top. Clicking a row opens the same `ReviewCard` detail
 * used elsewhere, in a right-side sheet.
 *
 * The caller is expected to remount this component (via a `key` derived
 * from the document ID set, e.g. `key={documents.map((d) => d.id).join(",")}`)
 * when documents are added or removed, so the metadata fetch re-runs —
 * the same key-remount convention `ReviewCard` uses instead of a
 * dependency-array effect.
 */
export function DocumentsTable({
  documents,
}: {
  documents: DocRow[];
}) {
  const [meta, setMeta] = useState<
    Record<string, { persons: string[]; tags: string[]; documentDate: string | null }>
  >({});
  const { openDocument } = useDocumentViewer();

  useMountEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      try {
        const result = await fetchDocumentsTableMeta(documents.map((d) => d.id));
        if (!cancelled) setMeta(result);
      } catch {
        if (!cancelled) setMeta({});
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
    };
  });

  // --- Filters ---
  const [search, setSearch] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // --- Sort ---
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // --- Pagination ---
  const [page, setPage] = useState(1);

  const enrichedRows = useMemo<EnrichedRow[]>(() => {
    return documents.map((doc) => {
      const docMeta = meta[doc.id];
      const documentType = doc.document_type ?? "other";
      return {
        doc,
        displayTitle: doc.title?.trim() || doc.original_filename || "Dokument",
        typeLabel:
          DOCUMENT_TYPE_LABELS[documentType as keyof typeof DOCUMENT_TYPE_LABELS] ??
          "Sonstiges",
        persons: docMeta?.persons ?? [],
        tags: docMeta?.tags ?? [],
        category: doc.category,
        resolvedDate: docMeta?.documentDate ?? doc.created_at,
      };
    });
  }, [documents, meta]);

  // --- Filter option lists (derived from actual data) ---
  const personOptions = useMemo(
    () => [...new Set(enrichedRows.flatMap((r) => r.persons))].sort((a, b) => a.localeCompare(b, "de")),
    [enrichedRows],
  );
  const categoryOptions = useMemo(
    () =>
      [...new Set(enrichedRows.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort(
        (a, b) => a.localeCompare(b, "de"),
      ),
    [enrichedRows],
  );
  const tagOptions = useMemo(
    () => [...new Set(enrichedRows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "de")),
    [enrichedRows],
  );

  const hasActiveFilters = Boolean(
    search || personFilter || categoryFilter || tagFilter || typeFilter || dateFrom || dateTo,
  );

  function resetFilters() {
    setSearch("");
    setPersonFilter("");
    setCategoryFilter("");
    setTagFilter("");
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const filteredRows = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return enrichedRows.filter((row) => {
      if (searchLower) {
        const haystack = [
          row.displayTitle,
          row.doc.original_filename,
          row.category,
          ...row.persons,
          ...row.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      if (personFilter && !row.persons.includes(personFilter)) return false;
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (tagFilter && !row.tags.includes(tagFilter)) return false;
      if (typeFilter && (row.doc.document_type ?? "other") !== typeFilter) return false;
      if (dateFrom && row.resolvedDate.slice(0, 10) < dateFrom) return false;
      if (dateTo && row.resolvedDate.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [enrichedRows, search, personFilter, categoryFilter, tagFilter, typeFilter, dateFrom, dateTo]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortColumn) {
        case "title":
          return a.displayTitle.localeCompare(b.displayTitle, "de") * dir;
        case "type":
          return a.typeLabel.localeCompare(b.typeLabel, "de") * dir;
        case "category":
          return (a.category ?? "").localeCompare(b.category ?? "", "de") * dir;
        case "status":
          return getStatusLabel(a.doc.status).localeCompare(getStatusLabel(b.doc.status), "de") * dir;
        case "date":
        default:
          return a.resolvedDate.localeCompare(b.resolvedDate) * dir;
      }
    });
    return rows;
  }, [filteredRows, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  /** Update a filter value and jump back to page 1, since the result set shape changes. */
  function setFilterAndResetPage<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function SortHeader({ column, label }: { column: SortColumn; label: string }) {
    const active = sortColumn === column;
    const Icon = active ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold tracking-wide transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        data-testid={`sort-${column}`}
      >
        {label}
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    );
  }

  const selectClassName =
    "w-full appearance-none rounded-ordilo-sm border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  function getStatusDotClass(status: string) {
    if (status === "confirmed") return "bg-[var(--petrol)]";
    if (status === "failed") return "bg-destructive";
    if (status === "uploaded" || status === "ocr_processing") return "bg-[var(--mist)]";
    return "bg-[var(--apricot)]";
  }

  return (
    <div data-testid="documents-table" className="space-y-2">
      <div className="overflow-hidden rounded-ordilo-md border border-border bg-card shadow-card">
        <div className="border-b border-border bg-[var(--sand)]/90 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/10">
                <Table2 className="size-4 text-[var(--petrol)]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Tabellenansicht</p>
                <p className="text-xs text-muted-foreground">
                  {documents.length} {documents.length === 1 ? "Dokument" : "Dokumente"} insgesamt
                  {sortedRows.length !== documents.length && (
                    <> · {sortedRows.length} gerade sichtbar</>
                  )}
                </p>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-ordilo-sm text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="documents-filter-reset"
              >
                <X className="size-3.5" aria-hidden="true" />
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>

        <div className="p-2.5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-7">
            <div className="relative col-span-2 sm:col-span-3 lg:col-span-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setFilterAndResetPage(setSearch, e.target.value)}
                placeholder="Suchen …"
                className="w-full rounded-ordilo-sm border border-border bg-card py-1 pr-2 pl-7 text-xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Dokumente durchsuchen"
                data-testid="documents-search-input"
              />
            </div>

            <select
              value={personFilter}
              onChange={(e) => setFilterAndResetPage(setPersonFilter, e.target.value)}
              className={selectClassName}
              aria-label="Nach Person filtern"
              data-testid="documents-filter-person"
            >
              <option value="">Alle Personen</option>
              {personOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setFilterAndResetPage(setTypeFilter, e.target.value)}
              className={selectClassName}
              aria-label="Nach Typ filtern"
              data-testid="documents-filter-type"
            >
              <option value="">Alle Typen</option>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setFilterAndResetPage(setCategoryFilter, e.target.value)}
              className={selectClassName}
              aria-label="Nach Kategorie filtern"
              data-testid="documents-filter-category"
            >
              <option value="">Alle Kategorien</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(e) => setFilterAndResetPage(setTagFilter, e.target.value)}
              className={selectClassName}
              aria-label="Nach Tag filtern"
              data-testid="documents-filter-tag"
            >
              <option value="">Alle Tags</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <div className="col-span-2 flex items-center gap-1.5 sm:col-span-3 lg:col-span-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setFilterAndResetPage(setDateFrom, e.target.value)}
                className="w-full rounded-ordilo-sm border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Datum von"
                data-testid="documents-filter-date-from"
              />
              <span className="text-muted-foreground" aria-hidden="true">
                –
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setFilterAndResetPage(setDateTo, e.target.value)}
                className="w-full rounded-ordilo-sm border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Datum bis"
                data-testid="documents-filter-date-to"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-ordilo-md border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-[var(--sand-light)]">
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="title" label="Dokument" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="type" label="Typ" />
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground">
                  Personen
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="category" label="Kategorie" />
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground">
                  Tags
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="date" label="Datum" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="status" label="Status" />
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    <div className="space-y-1">
                      <p>Keine Dokumente gefunden.</p>
                      {hasActiveFilters && (
                        <p className="text-xs text-[var(--mist-dark)]">
                          Gerade passt nichts zu deiner Auswahl.{" "}
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="font-medium text-[var(--petrol)] underline-offset-2 hover:underline"
                          >
                            Alles wieder zeigen
                          </button>
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const FileIcon = getFileIcon(row.doc.mime_type);
                  const personSummary = summarizeValues(row.persons);
                  const tagSummary = summarizeValues(row.tags);
                  return (
                    <tr
                      key={row.doc.id}
                      onClick={() => void openDocument(row.doc.id)}
                      className="group cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-[var(--sand-warm)]/40"
                      data-testid="documents-table-row"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--sand-light)] transition-colors group-hover:bg-[var(--sand-warm)]/80">
                            <FileIcon
                              className="size-4 shrink-0 text-[var(--mist-dark)]"
                              aria-hidden="true"
                            />
                          </div>
                          <span className="block truncate font-medium text-foreground">
                            {row.displayTitle}
                          </span>
                          <ArrowUpRight
                            className="hidden size-3.5 shrink-0 text-[var(--petrol)] opacity-0 transition-opacity group-hover:opacity-100 lg:block"
                            aria-hidden="true"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {row.typeLabel}
                      </td>
                      <td className="px-3 py-2.5">
                        {personSummary === null ? (
                          <span className="text-muted-foreground">–</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span
                              className="inline-flex max-w-full items-center rounded-full border border-border bg-[var(--sand-light)] px-2 py-0.5 text-xs font-medium text-foreground"
                              title={personSummary.first}
                            >
                              <span className="truncate">{personSummary.first}</span>
                            </span>
                            {personSummary.remaining > 0 && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-xs text-muted-foreground"
                              >
                                +{personSummary.remaining}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span
                          className="block truncate"
                          title={row.category ?? undefined}
                        >
                          {row.category ?? "–"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {tagSummary === null ? (
                          <span className="text-muted-foreground">–</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span
                              className="inline-flex max-w-full items-center rounded-full border border-border bg-[var(--sand-light)] px-2 py-0.5 text-xs font-medium text-[var(--mist-dark)]"
                              title={tagSummary.first}
                            >
                              <span className="truncate">{tagSummary.first}</span>
                            </span>
                            {tagSummary.remaining > 0 && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-xs text-muted-foreground"
                              >
                                +{tagSummary.remaining}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatGermanDate(row.resolvedDate) ?? "–"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                            getStatusBadgeClasses(row.doc.status),
                          )}
                          title={getStatusLabel(row.doc.status)}
                        >
                          <span
                            className={cn("size-1.5 rounded-full", getStatusDotClass(row.doc.status))}
                            aria-hidden="true"
                          />
                          <span className="truncate">{getCompactStatusLabel(row.doc.status)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sortedRows.length > 0 && (
        <div className="flex items-center justify-between rounded-ordilo-sm border border-border bg-[var(--sand)] px-3 py-2 text-xs text-muted-foreground">
          <span data-testid="documents-table-page-info">
            Seite {currentPage} von {totalPages} · {sortedRows.length}{" "}
            {sortedRows.length === 1 ? "Dokument" : "Dokumente"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex size-8 items-center justify-center rounded-ordilo-sm border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Vorherige Seite"
              data-testid="documents-table-prev-page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="flex size-8 items-center justify-center rounded-ordilo-sm border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Nächste Seite"
              data-testid="documents-table-next-page"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
