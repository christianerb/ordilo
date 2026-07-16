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
  Trash2,
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

const PAGE_SIZE = 20;

type SortColumn = "title" | "type" | "category" | "date" | "status";
type SortDirection = "asc" | "desc";

interface EnrichedRow {
  doc: DocRow;
  displayTitle: string;
  typeLabel: string;
  category: string | null;
  /** The document's own date (earliest extracted date entity), falling back to created_at. */
  resolvedDate: string;
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
 * Documents Table — filterable, sortable, paginated view of the family's
 * documents. Three filters (search, type, status) cover the vast majority
 * of查找 needs; everything else is searchable. Clicking a row opens the
 * document detail sheet.
 */
export function DocumentsTable({
  documents,
  onDelete,
}: {
  documents: DocRow[];
  onDelete?: (documentId: string) => void;
}) {
  const [meta, setMeta] = useState<
    Record<string, { documentDate: string | null }>
  >({});
  const { openDocument } = useDocumentViewer();

  useMountEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      try {
        const result = await fetchDocumentsTableMeta(documents.map((d) => d.id));
        if (!cancelled)
          setMeta(
            Object.fromEntries(
              Object.entries(result).map(([id, m]) => [id, { documentDate: m.documentDate }]),
            ),
          );
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
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // --- Sort ---
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // --- Pagination ---
  const [page, setPage] = useState(1);

  const enrichedRows = useMemo<EnrichedRow[]>(() => {
    return documents.map((doc) => {
      const documentType = doc.document_type ?? "other";
      const docMeta = meta[doc.id];
      return {
        doc,
        displayTitle: doc.title?.trim() || doc.original_filename || "Dokument",
        typeLabel:
          DOCUMENT_TYPE_LABELS[documentType as keyof typeof DOCUMENT_TYPE_LABELS] ??
          "Sonstiges",
        category: doc.category,
        resolvedDate: docMeta?.documentDate ?? doc.created_at,
      };
    });
  }, [documents, meta]);

  const hasActiveFilters = Boolean(search || typeFilter || statusFilter);

  function resetFilters() {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
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
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      if (typeFilter && (row.doc.document_type ?? "other") !== typeFilter) return false;
      if (statusFilter === "pending" && row.doc.status === "confirmed") return false;
      if (statusFilter === "confirmed" && row.doc.status !== "confirmed") return false;
      if (statusFilter === "failed" && row.doc.status !== "failed") return false;
      if (statusFilter === "new" && row.doc.status !== "uploaded" && row.doc.status !== "ocr_processing" && row.doc.status !== "ocr_done" && row.doc.status !== "analyzing") return false;
      return true;
    });
  }, [enrichedRows, search, typeFilter, statusFilter]);

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
    "appearance-none rounded-ordilo-sm border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  function getStatusDotClass(status: string) {
    if (status === "confirmed") return "bg-[var(--petrol)]";
    if (status === "failed") return "bg-destructive";
    if (status === "uploaded" || status === "ocr_processing") return "bg-[var(--mist)]";
    return "bg-[var(--apricot)]";
  }

  return (
    <div data-testid="documents-table" className="space-y-2">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[140px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setFilterAndResetPage(setSearch, e.target.value)}
            placeholder="Suchen …"
            className="w-full rounded-ordilo-sm border border-border bg-card py-1.5 pr-2 pl-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Dokumente durchsuchen"
            data-testid="documents-search-input"
          />
        </div>

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
          value={statusFilter}
          onChange={(e) => setFilterAndResetPage(setStatusFilter, e.target.value)}
          className={selectClassName}
          aria-label="Nach Status filtern"
          data-testid="documents-filter-status"
        >
          <option value="">Alle Status</option>
          <option value="pending">Zum Durchsehen</option>
          <option value="confirmed">Im Familienbuch</option>
          <option value="new">Neu</option>
          <option value="failed">Fehler</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-ordilo-sm text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="documents-filter-reset"
          >
            <X className="size-3.5" aria-hidden="true" />
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-ordilo-md border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-[var(--sand-light)]">
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="title" label="Dokument" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="type" label="Typ" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader column="category" label="Kategorie" />
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
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
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
                  const openRow = () => void openDocument(row.doc.id);
                  return (
                    <tr
                      key={row.doc.id}
                      role="button"
                      tabIndex={0}
                      onClick={openRow}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRow();
                        }
                      }}
                      aria-label={`${row.displayTitle} öffnen`}
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
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span
                          className="block truncate"
                          title={row.category ?? undefined}
                        >
                          {row.category ?? "–"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatGermanDate(row.resolvedDate) ?? "–"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
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
                          {onDelete && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete(row.doc.id);
                              }}
                              className="flex size-7 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                              aria-label={`${row.displayTitle} löschen`}
                              data-testid={`documents-table-delete-${row.doc.id}`}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
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
