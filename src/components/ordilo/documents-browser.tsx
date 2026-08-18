"use client";

import { useMemo, useRef, useState } from "react";
import {
  Sparkles,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  FileText,
  Trash2,
  ArrowUpRight,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";
import { getStatusLabel, getFileIcon } from "@/lib/schemas/document";
import { DOCUMENT_TYPE_LABELS } from "@/lib/schemas/extraction";
import {
  getCollectionColor,
  getCollectionIcon,
} from "@/lib/schemas/collections";
import { categoriesMatch } from "@/lib/categories";
import { useCollections } from "@/lib/collections/collections-context";
import { fetchDocumentsTableMeta } from "@/lib/documents-table";
import { useChangeEffect } from "@/lib/hooks/use-change-effect";
import { useDocumentViewer } from "@/lib/scan/scan-context";
import {
  LibraryBadge,
  LibraryFilterButton,
  LibraryList,
  LibraryNoResults,
  LibraryRow,
  LibrarySearchField,
  LibraryTile,
  LibraryToolbar,
} from "@/components/ordilo/library-surface";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Database } from "@/types/database";

type DocRow = Database["public"]["Tables"]["documents"]["Row"];

const PAGE_SIZE = 20;
/** How many documents the "Zuletzt hinzugefügt" rail shows. */
const RECENT_COUNT = 6;

type SortKey = "newest" | "oldest" | "title";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Neueste zuerst",
  oldest: "Älteste zuerst",
  title: "Titel A–Z",
};

interface EnrichedRow {
  doc: DocRow;
  displayTitle: string;
  typeLabel: string;
  category: string | null;
  /** The document's own date (earliest extracted date), else created_at. */
  resolvedDate: string;
}

/**
 * Status pill colors, in the warm palette: Harbor Blue once a document is
 * filed, apricot while it waits for someone to look at it, destructive
 * when it failed, and calm sand for everything still in progress.
 */
function getStatusPillClass(status: string) {
  if (status === "confirmed") {
    return "border-[var(--petrol)]/20 bg-[var(--petrol)]/10 text-[var(--petrol)]";
  }
  if (status === "failed") {
    return "border-[var(--destructive)]/20 bg-[var(--destructive)]/10 text-[var(--destructive)]";
  }
  if (status === "analyzed") {
    return "border-[var(--apricot)]/25 bg-[var(--apricot)]/10 text-[var(--apricot-text)]";
  }
  return "border-[var(--mist-light)] bg-[var(--sand-light)] text-[var(--mist-dark)]";
}

/**
 * Documents Browser — the family's document library.
 *
 * Built for a thumb: one search field that either filters the list or
 * hands the question to Ordilo, collection chips for the filter people
 * actually use, a rail of what was added most recently, and one calm row
 * per document. The old sortable five-column table needed 640px and a
 * sideways scroll on a phone to show what these rows say in one line.
 */
export function DocumentsBrowser({
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
  const { collections } = useCollections();

  // Sorted so a pure re-ordering of the list doesn't retrigger the fetch.
  const docIds = useMemo(() => documents.map((d) => d.id).sort(), [documents]);
  const docIdsKey = docIds.join(",");

  /**
   * Document IDs whose metadata was already fetched. The list stays
   * mounted across polls and fetches metadata incrementally: only IDs it
   * has never seen are requested, everything else is served from state.
   */
  const loadedMetaIdsRef = useRef<Set<string>>(new Set());

  useChangeEffect(() => {
    const missingIds = docIds.filter((id) => !loadedMetaIdsRef.current.has(id));
    if (missingIds.length === 0) return;
    let cancelled = false;
    async function loadMeta() {
      try {
        const result = await fetchDocumentsTableMeta(missingIds);
        if (cancelled) return;
        for (const id of missingIds) loadedMetaIdsRef.current.add(id);
        setMeta((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(result).map(([id, m]) => [
              id,
              { documentDate: m.documentDate },
            ]),
          ),
        }));
      } catch {
        // Leave the IDs unmarked so a later document-list change retries.
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [docIdsKey]);

  // --- Filters ---
  const [search, setSearch] = useState("");
  /** Collection name, or "" for "Alle". */
  const [collectionFilter, setCollectionFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const [sort, setSort] = useState<SortKey>("newest");
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

  const collectionFor = useMemo(() => {
    return (category: string | null) => {
      if (!category) return undefined;
      return collections.find((c) => categoriesMatch(c.name, category));
    };
  }, [collections]);

  const hasActiveFilters = Boolean(
    search || collectionFilter || typeFilter || statusFilter,
  );

  function resetFilters() {
    setSearch("");
    setCollectionFilter("");
    setTypeFilter("");
    setStatusFilter("");
    setSort("newest");
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
      if (
        collectionFilter &&
        !(row.category && categoriesMatch(row.category, collectionFilter))
      ) {
        return false;
      }
      if (typeFilter && (row.doc.document_type ?? "other") !== typeFilter) return false;
      if (statusFilter === "pending" && row.doc.status === "confirmed") return false;
      if (statusFilter === "confirmed" && row.doc.status !== "confirmed") return false;
      if (statusFilter === "failed" && row.doc.status !== "failed") return false;
      if (
        statusFilter === "new" &&
        row.doc.status !== "uploaded" &&
        row.doc.status !== "ocr_processing" &&
        row.doc.status !== "ocr_done" &&
        row.doc.status !== "analyzing"
      ) {
        return false;
      }
      return true;
    });
  }, [enrichedRows, search, collectionFilter, typeFilter, statusFilter]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      switch (sort) {
        case "title":
          return a.displayTitle.localeCompare(b.displayTitle, "de");
        case "oldest":
          return a.resolvedDate.localeCompare(b.resolvedDate);
        case "newest":
        default:
          return b.resolvedDate.localeCompare(a.resolvedDate);
      }
    });
    return rows;
  }, [filteredRows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // The rail is a shortcut to "the thing I just added", so it only makes
  // sense on the unfiltered list — and only when there is more to scroll
  // through than the rail itself would show.
  const recentRows = useMemo(() => {
    if (hasActiveFilters) return [];
    if (enrichedRows.length <= RECENT_COUNT) return [];
    return [...enrichedRows]
      .sort((a, b) => b.doc.created_at.localeCompare(a.doc.created_at))
      .slice(0, RECENT_COUNT);
  }, [enrichedRows, hasActiveFilters]);

  function setFilterAndResetPage<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  const askHref = `/suche${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`;

  /** Full-bleed inside the panel's padding, for horizontal rails. */
  const railBleed =
    "-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div data-testid="documents-browser" className="space-y-4">
      {/* Search — filters as you type, or hands the question to Ordilo */}
      <LibraryToolbar>
        <LibrarySearchField
          value={search}
          onChange={(value) => setFilterAndResetPage(setSearch, value)}
          placeholder="Dokumente durchsuchen …"
          label="Dokumente durchsuchen"
          testId="documents-search-input"
          trailing={
            <Link
              href={askHref}
              className="flex size-8 items-center justify-center rounded-full bg-[var(--petrol)]/10 text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/15 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Ordilo dazu fragen"
              title="Ordilo fragen"
              data-testid="documents-ask-ordilo"
            >
              <Sparkles className="size-4" aria-hidden="true" />
            </Link>
          }
        />
        <LibraryFilterButton
          open={moreFiltersOpen}
          onToggle={() => setMoreFiltersOpen((open) => !open)}
          active={Boolean(typeFilter || statusFilter || sort !== "newest")}
          testId="documents-more-filters"
        />
      </LibraryToolbar>

      {moreFiltersOpen && (
        <div
          className="animate-card-in grid gap-3 rounded-ordilo-sm border border-[color-mix(in_srgb,var(--border)_75%,transparent)] bg-[var(--surface-story)] p-3 sm:grid-cols-3"
          data-testid="documents-filter-panel"
        >
          <FilterSelect
            label="Art"
            value={typeFilter}
            onChange={(value) => setFilterAndResetPage(setTypeFilter, value)}
            testId="documents-filter-type"
          >
            <option value="">Alle Typen</option>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(value) => setFilterAndResetPage(setStatusFilter, value)}
            testId="documents-filter-status"
          >
            <option value="">Alle Status</option>
            <option value="pending">Zum Durchsehen</option>
            <option value="confirmed">Im Familienbuch</option>
            <option value="new">Neu</option>
            <option value="failed">Fehler</option>
          </FilterSelect>

          <FilterSelect
            label="Sortierung"
            value={sort}
            onChange={(value) => setSort(value as SortKey)}
            testId="documents-sort"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FilterSelect>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 self-end justify-self-start rounded-ordilo-sm px-1 text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:col-span-3"
              data-testid="documents-filter-reset"
            >
              <X className="size-4" aria-hidden="true" />
              Zurücksetzen
            </button>
          )}
        </div>
      )}

      {/* Collection chips — the filter people actually reach for */}
      {collections.length > 0 && (
        <div className={railBleed} data-testid="documents-collection-chips">
          <FilterChip
            label="Alle"
            icon={FileText}
            active={!collectionFilter}
            onClick={() => setFilterAndResetPage(setCollectionFilter, "")}
            testId="documents-chip-all"
          />
          {collections.map((collection) => (
            <FilterChip
              key={collection.id}
              label={collection.name}
              icon={getCollectionIcon(collection.icon)}
              active={collectionFilter === collection.name}
              onClick={() =>
                setFilterAndResetPage(
                  setCollectionFilter,
                  collectionFilter === collection.name ? "" : collection.name,
                )
              }
              testId={`documents-chip-${collection.id}`}
            />
          ))}
        </div>
      )}

      {/* Zuletzt hinzugefügt */}
      {recentRows.length > 0 && (
        <section className="space-y-2" data-testid="documents-recent">
          <h2 className="text-sm font-semibold text-foreground">
            Zuletzt hinzugefügt
          </h2>
          <div className={cn(railBleed, "gap-3 pt-0.5")}>
            {recentRows.map((row) => {
              const collection = collectionFor(row.category);
              const color = collection
                ? getCollectionColor(collection.color)
                : null;
              return (
                <button
                  key={row.doc.id}
                  type="button"
                  onClick={() => void openDocument(row.doc.id)}
                  className="card-lift flex w-40 shrink-0 flex-col items-start gap-2.5 rounded-ordilo-sm border border-[color-mix(in_srgb,var(--border)_75%,transparent)] bg-[var(--surface-story)] p-3 text-left hover:border-[var(--petrol)]/25 hover:bg-[var(--sand)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="documents-recent-card"
                >
                  <LibraryTile
                    icon={
                      collection
                        ? getCollectionIcon(collection.icon)
                        : getFileIcon(row.doc.mime_type)
                    }
                    background={color?.bg}
                    foreground={color?.fg}
                  />
                  <span className="line-clamp-2 text-sm font-medium text-foreground">
                    {row.displayTitle}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {[formatGermanDate(row.resolvedDate), row.typeLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* All documents */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Alle Dokumente
          </h2>
          <span className="text-xs text-muted-foreground">
            {sortedRows.length}{" "}
            {sortedRows.length === 1 ? "Dokument" : "Dokumente"}
            {sort !== "newest" && ` · ${SORT_LABELS[sort]}`}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <LibraryNoResults
            message="Keine Dokumente gefunden."
            hint={
              hasActiveFilters
                ? "Gerade passt nichts zu deiner Auswahl."
                : undefined
            }
            onReset={hasActiveFilters ? resetFilters : undefined}
          />
        ) : (
          <LibraryList testId="documents-list">
            {pageRows.map((row) => {
              const collection = collectionFor(row.category);
              const color = collection
                ? getCollectionColor(collection.color)
                : null;
              return (
                <LibraryRow
                  key={row.doc.id}
                  testId="documents-row"
                  leading={
                    <LibraryTile
                      icon={
                        collection
                          ? getCollectionIcon(collection.icon)
                          : getFileIcon(row.doc.mime_type)
                      }
                      background={color?.bg}
                      foreground={color?.fg}
                    />
                  }
                  title={row.displayTitle}
                  titleAdornment={
                    <ArrowUpRight
                      className="hidden size-3.5 shrink-0 text-[var(--petrol)] opacity-0 transition-opacity group-hover:opacity-100 lg:block"
                      aria-hidden="true"
                    />
                  }
                  subtitle={
                    <>
                      <span>{row.typeLabel}</span>
                      {row.category && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{row.category}</span>
                        </>
                      )}
                    </>
                  }
                  meta={
                    <>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatGermanDate(row.resolvedDate) ?? "–"}
                      </span>
                      <LibraryBadge
                        className={getStatusPillClass(row.doc.status)}
                      >
                        {getStatusLabel(row.doc.status)}
                      </LibraryBadge>
                    </>
                  }
                  actionLabel={`${row.displayTitle} öffnen`}
                  onClick={() => void openDocument(row.doc.id)}
                  trailing={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          aria-label={`Aktionen für ${row.displayTitle}`}
                          data-testid={`documents-row-menu-${row.doc.id}`}
                        >
                          <MoreHorizontal
                            className="size-4.5"
                            aria-hidden="true"
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => void openDocument(row.doc.id)}
                          data-testid={`documents-row-open-${row.doc.id}`}
                        >
                          <FileText className="size-4" aria-hidden="true" />
                          Öffnen
                        </DropdownMenuItem>
                        {onDelete && (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onDelete(row.doc.id)}
                            data-testid={`documents-row-delete-${row.doc.id}`}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            Löschen
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              );
            })}
          </LibraryList>
        )}
      </section>

      {/* Pagination — only once a family has more than one page */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-ordilo-sm border border-[color-mix(in_srgb,var(--border)_75%,transparent)] bg-[var(--surface-story)] px-3 py-2 text-xs text-muted-foreground">
          <span data-testid="documents-page-info">
            Seite {currentPage} von {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex size-9 items-center justify-center rounded-ordilo-sm border border-border bg-[var(--surface-box)] text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Vorherige Seite"
              data-testid="documents-prev-page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="flex size-9 items-center justify-center rounded-ordilo-sm border border-border bg-[var(--surface-box)] text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Nächste Seite"
              data-testid="documents-next-page"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One labelled select inside the filter panel. */
function FilterSelect({
  label,
  value,
  onChange,
  testId,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-ordilo-sm border border-border bg-[var(--surface-box)] px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid={testId}
      >
        {children}
      </select>
    </label>
  );
}

/**
 * One collection chip. Active state uses the Harbor Blue wash (never
 * apricot — that stays reserved for the nav's "you are here").
 */
function FilterChip({
  label,
  icon: Icon,
  active,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "press-scale inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
          : "border-border bg-[var(--sand)] text-[var(--mist-dark)] hover:text-foreground",
      )}
      data-testid={testId}
    >
      <Icon className="size-4 shrink-0" />
      <span className="max-w-32 truncate">{label}</span>
    </button>
  );
}
