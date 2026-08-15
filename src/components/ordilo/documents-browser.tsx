"use client";

import { useMemo, useRef, useState } from "react";
import {
  Search,
  Sparkles,
  SlidersHorizontal,
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
 * Status dot color. The label already says what the state is; the dot is
 * what the eye picks up when scanning a long list.
 */
function getStatusDotClass(status: string) {
  if (status === "confirmed") return "bg-[var(--petrol)]";
  if (status === "failed") return "bg-destructive";
  if (status === "uploaded" || status === "ocr_processing") return "bg-[var(--mist)]";
  return "bg-[var(--apricot)]";
}

function getStatusTextClass(status: string) {
  if (status === "confirmed") return "text-[var(--petrol)]";
  if (status === "failed") return "text-destructive";
  return "text-muted-foreground";
}

/**
 * The colored icon tile in front of every document.
 *
 * A document filed into a collection wears that collection's icon and
 * color — the same one the sidebar shows — so a glance down the list
 * groups documents by where they live without a single extra word.
 * Everything else falls back to its file-type icon on a calm sand tile.
 */
function DocumentTile({
  doc,
  collection,
  className,
}: {
  doc: DocRow;
  collection?: { icon: string | null; color: string | null };
  className?: string;
}) {
  const Icon = collection ? getCollectionIcon(collection.icon) : getFileIcon(doc.mime_type);
  const color = collection ? getCollectionColor(collection.color) : null;

  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-ordilo-sm",
        !color && "bg-[var(--sand-light)]",
        className,
      )}
      style={color ? { backgroundColor: color.bg } : undefined}
      aria-hidden="true"
    >
      <Icon
        className="size-4.5"
        style={{ color: color ? color.fg : "var(--mist-dark)" }}
      />
    </span>
  );
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

  /** Full-bleed inside the page's padded column, for horizontal rails. */
  const railBleed =
    "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div data-testid="documents-browser" className="space-y-4">
      {/* Search — filters as you type, or hands the question to Ordilo */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setFilterAndResetPage(setSearch, e.target.value)}
          placeholder="Dokumente suchen oder Ordilo fragen …"
          className="h-13 w-full rounded-full border border-border bg-card py-3.5 pr-14 pl-11 text-sm text-foreground shadow-card placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Dokumente durchsuchen"
          data-testid="documents-search-input"
        />
        <Link
          href={askHref}
          className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--petrol)]/10 text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/15 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Ordilo dazu fragen"
          title="Ordilo fragen"
          data-testid="documents-ask-ordilo"
        >
          <Sparkles className="size-4.5" aria-hidden="true" />
        </Link>
      </div>

      {/* Collection chips + the rest of the filters behind one button */}
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
        <button
          type="button"
          onClick={() => setMoreFiltersOpen((open) => !open)}
          aria-expanded={moreFiltersOpen}
          aria-label="Weitere Filter"
          title="Weitere Filter"
          className={cn(
            "ml-auto flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            moreFiltersOpen || typeFilter || statusFilter
              ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
          data-testid="documents-more-filters"
        >
          <SlidersHorizontal className="size-4.5" aria-hidden="true" />
        </button>
      </div>

      {moreFiltersOpen && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-ordilo-md border border-border bg-card p-3 shadow-card"
          data-testid="documents-filter-panel"
        >
          <select
            value={typeFilter}
            onChange={(e) => setFilterAndResetPage(setTypeFilter, e.target.value)}
            className="h-9 rounded-ordilo-sm border border-border bg-[var(--sand)] px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
            className="h-9 rounded-ordilo-sm border border-border bg-[var(--sand)] px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
              className="inline-flex items-center gap-1 rounded-ordilo-sm px-1 text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="documents-filter-reset"
            >
              <X className="size-4" aria-hidden="true" />
              Zurücksetzen
            </button>
          )}
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
              return (
                <button
                  key={row.doc.id}
                  type="button"
                  onClick={() => void openDocument(row.doc.id)}
                  className="card-lift flex w-44 shrink-0 flex-col items-start gap-2.5 rounded-ordilo-md border border-border bg-card p-3 text-left shadow-card hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="documents-recent-card"
                >
                  <DocumentTile doc={row.doc} collection={collection} />
                  <span className="line-clamp-2 text-sm font-medium text-foreground">
                    {row.displayTitle}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[formatGermanDate(row.resolvedDate), row.typeLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium",
                      getStatusTextClass(row.doc.status),
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        getStatusDotClass(row.doc.status),
                      )}
                      aria-hidden="true"
                    />
                    {getStatusLabel(row.doc.status)}
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
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Sortieren:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-ordilo-sm border border-transparent bg-transparent py-1 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Sortierung"
              data-testid="documents-sort"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {pageRows.length === 0 ? (
          <div className="rounded-ordilo-md border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
            <p>Keine Dokumente gefunden.</p>
            {hasActiveFilters && (
              <p className="mt-1 text-xs text-[var(--mist-dark)]">
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
        ) : (
          <ul
            className="divide-y divide-border/70 overflow-hidden rounded-ordilo-md border border-border bg-card shadow-card"
            data-testid="documents-list"
          >
            {pageRows.map((row) => {
              const collection = collectionFor(row.category);
              return (
                <li
                  key={row.doc.id}
                  className="group flex items-center gap-1 pr-2 transition-colors hover:bg-[var(--sand-warm)]/40"
                  data-testid="documents-row"
                >
                  <button
                    type="button"
                    onClick={() => void openDocument(row.doc.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
                    aria-label={`${row.displayTitle} öffnen`}
                  >
                    <DocumentTile doc={row.doc} collection={collection} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {row.displayTitle}
                        </span>
                        <ArrowUpRight
                          className="hidden size-3.5 shrink-0 text-[var(--petrol)] opacity-0 transition-opacity group-hover:opacity-100 lg:block"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <span>{row.typeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {formatGermanDate(row.resolvedDate) ?? "–"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 font-medium",
                            getStatusTextClass(row.doc.status),
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              getStatusDotClass(row.doc.status),
                            )}
                            aria-hidden="true"
                          />
                          {getStatusLabel(row.doc.status)}
                        </span>
                      </span>
                    </span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        aria-label={`Aktionen für ${row.displayTitle}`}
                        data-testid={`documents-row-menu-${row.doc.id}`}
                      >
                        <MoreHorizontal className="size-4.5" aria-hidden="true" />
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
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Pagination — only once a family has more than one page */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-ordilo-sm border border-border bg-[var(--sand)] px-3 py-2 text-xs text-muted-foreground">
          <span data-testid="documents-page-info">
            Seite {currentPage} von {totalPages} · {sortedRows.length}{" "}
            {sortedRows.length === 1 ? "Dokument" : "Dokumente"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex size-8 items-center justify-center rounded-ordilo-sm border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Vorherige Seite"
              data-testid="documents-prev-page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="flex size-8 items-center justify-center rounded-ordilo-sm border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
        "press-scale inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "border-[var(--petrol)]/25 bg-[var(--petrol)]/10 text-[var(--petrol)]"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
      data-testid={testId}
    >
      <Icon className="size-4 shrink-0" />
      <span className="max-w-32 truncate">{label}</span>
    </button>
  );
}
