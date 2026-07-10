"use client";

import { useState, useMemo } from "react";
import {
  Camera,
  UploadCloud,
  Loader2,
  ScanLine,
  Sparkles,
  Heart,
  ChevronDown,
  ChevronUp,
  Folder,
  FileText,
  Receipt,
  Mail,
  FileCheck,
  HeartPulse,
  GraduationCap,
  Shield,
  Calculator,
  Table2,
  Search,
  X,
  ArrowUpDown,
  type LucideIcon,
} from "lucide-react";
import { ACCEPTED_FILE_EXTENSIONS } from "@/lib/schemas/document";
import { DocumentCard } from "@/components/ordilo/document-card";
import { DocumentsTable } from "@/components/ordilo/documents-table";
import { EmptyState } from "@/components/ordilo/empty-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { UploadProgressCard } from "@/components/ordilo/scan-wizard/upload-progress";
import { useScan } from "@/lib/scan/scan-context";
import { useScanActions } from "@/lib/scan/scan-context";
import { toast } from "sonner";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Folder configuration — icon + German label per document type
// ---------------------------------------------------------------------------

const FOLDER_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  invoice: { icon: Receipt, label: "Rechnungen" },
  letter: { icon: Mail, label: "Briefe" },
  contract: { icon: FileCheck, label: "Verträge" },
  medical: { icon: HeartPulse, label: "Arztbriefe" },
  school: { icon: GraduationCap, label: "Schule" },
  insurance: { icon: Shield, label: "Versicherungen" },
  tax: { icon: Calculator, label: "Steuer" },
  other: { icon: Folder, label: "Sonstiges" },
};

/** Folder display order (matches the enum order in extraction.ts). */
const FOLDER_ORDER: string[] = [
  "invoice",
  "letter",
  "contract",
  "medical",
  "school",
  "insurance",
  "tax",
  "other",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DocRow = Database["public"]["Tables"]["documents"]["Row"];

function groupByType(docs: DocRow[]): Map<string, DocRow[]> {
  const groups = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const type = doc.document_type ?? "other";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(doc);
  }
  return groups;
}

function getLibraryMoment({
  totalDocuments,
  reviewCount,
  confirmedCount,
  uploadCount,
}: {
  totalDocuments: number;
  reviewCount: number;
  confirmedCount: number;
  uploadCount: number;
}) {
  if (uploadCount > 0) {
    return {
      icon: UploadCloud,
      label: "Neue Seiten sind unterwegs.",
      detail: "Ordilo legt sie gleich sauber in eure Ablage.",
    };
  }

  if (reviewCount > 0) {
    return {
      icon: Sparkles,
      label: `Heute zuerst: ${reviewCount} ${reviewCount === 1 ? "Dokument wartet" : "Dokumente warten"} noch aufs Durchsehen.`,
      detail:
        confirmedCount > 0
          ? `${confirmedCount} ${confirmedCount === 1 ? "liegt schon" : "liegen schon"} im Familienbuch.`
          : "Danach landet alles im Familienbuch.",
    };
  }

  if (totalDocuments > 0) {
    return {
      icon: Heart,
      label: "Alles ist schön einsortiert.",
      detail: "Neue Scans tauchen hier sofort wieder auf.",
    };
  }

  return {
    icon: ScanLine,
    label: "Der erste Scan macht den Anfang.",
    detail: "Danach hält Ordilo alles an einem warmen Ort zusammen.",
  };
}

// ---------------------------------------------------------------------------
// Collapsible folder section
// ---------------------------------------------------------------------------

function FolderSection({
  folderKey,
  docs,
  expandedDocId,
  openDocument,
  closeDocument,
  onRetryFailed,
  onDeleteDocument,
  defaultOpen,
}: {
  folderKey: string;
  docs: DocRow[];
  expandedDocId: string | null;
  openDocument: (documentId: string) => Promise<void>;
  closeDocument: () => void;
  onRetryFailed: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);
  const config = FOLDER_CONFIG[folderKey] ?? FOLDER_CONFIG.other;
  const Icon = config.icon;

  return (
    <div data-testid={`folder-${folderKey}`}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-ordilo-sm border border-border bg-card px-3 py-2 text-left shadow-card transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-expanded={isOpen}
      >
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
        >
          <Icon
            className="size-4"
            style={{ color: "var(--petrol)" }}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <span className="flex-1 text-sm font-medium text-foreground">
          {config.label}
        </span>
        <span
          className="text-xs font-medium text-muted-foreground tabular-nums"
        >
          {docs.length}
        </span>
        {isOpen ? (
          <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="mt-1.5 grid gap-1.5 pl-0.5 md:grid-cols-2">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              title={doc.title}
              originalFilename={doc.original_filename}
              mimeType={doc.mime_type}
              status={doc.status}
              createdAt={doc.created_at}
              errorMessage={doc.error_message}
              documentType={doc.document_type}
              onClick={() =>
                expandedDocId === doc.id
                  ? closeDocument()
                  : void openDocument(doc.id)
              }
              onRetry={
                doc.status === "failed"
                  ? () => onRetryFailed(doc.id)
                  : undefined
              }
              onDelete={() => onDeleteDocument(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Dokumente page — the family's document library, organized into folders.
 *
 * Documents are grouped into collapsible folder sections by document type
 * (Rechnungen, Briefe, Verträge, etc.). Documents that still need review
 * (not yet confirmed) appear in a "Zu bestätigen" section at the top.
 * Failed documents appear in their own section for quick retry.
 */
export default function DokumentePage() {
  const {
    documents,
    loadingDocs,
    loadDocuments,
    uploads,
    isDragOver,
    expandedDocId,
    openDocument,
    closeDocument,
    cameraInputRef,
    pdfInputRef,
    dropZoneRef,
    handleCameraSelect,
    handlePdfSelect,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRetry,
    dismissUpload,
    handleRetryFailed,
    handleDeleteDocument,
    openWizard,
  } = useScan();
  const { openCreateNote } = useScanActions();

  const [view, setView] = useState<"folder" | "table">("folder");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "title" | "type">("date");

  // Auto-switch to table view on desktop
  useMountEffect(() => {
    if (typeof window === "undefined") return;
    void loadDocuments();
    if (window.innerWidth >= 1024) {
      setView("table");
    }
    const params = new URLSearchParams(window.location.search);
    const docId = params.get("doc");
    if (docId) {
      void openDocument(docId);
    }
  });

  const hasDocuments = documents.length > 0;
  const hasActiveUploads = uploads.length > 0;

  // Remounts the table (and its metadata fetch) when the document set
  // itself changes, per the key-remount convention (see ReviewCard).
  const docIdsKey = useMemo(
    () => documents.map((d) => d.id).sort().join(","),
    [documents],
  );

  // Split documents into review queue, failed, and confirmed (folder) groups.
  const { reviewDocs, confirmedDocs } = useMemo(() => {
    const review: DocRow[] = [];
    const confirmed: DocRow[] = [];
    for (const doc of documents) {
      if (doc.status === "confirmed") {
        confirmed.push(doc);
      } else {
        // Everything else (processing, analyzed, failed) needs attention.
        review.push(doc);
      }
    }
    return { reviewDocs: review, confirmedDocs: confirmed };
  }, [documents]);

  // --- Search + Filter logic ---
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    // Search by title or filename
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((d) =>
        (d.title ?? "").toLowerCase().includes(q) ||
        (d.original_filename ?? "").toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q)
      );
    }

    // Filter by status
    if (statusFilter === "pending") {
      result = result.filter((d) => d.status !== "confirmed");
    } else if (statusFilter === "confirmed") {
      result = result.filter((d) => d.status === "confirmed");
    }

    // Filter by type
    if (typeFilter) {
      result = result.filter((d) => (d.document_type ?? "other") === typeFilter);
    }

    // Sort
    if (sortBy === "date") {
      result.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sortBy === "title") {
      result.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    } else if (sortBy === "type") {
      result.sort((a, b) => (a.document_type ?? "").localeCompare(b.document_type ?? ""));
    }

    return result;
  }, [documents, searchQuery, statusFilter, typeFilter, sortBy]);

  // Re-derive review/confirmed from filtered set
  const { reviewDocs: filteredReviewDocs, confirmedDocs: filteredConfirmedDocs } = useMemo(() => {
    const review: DocRow[] = [];
    const confirmed: DocRow[] = [];
    for (const doc of filteredDocuments) {
      if (doc.status === "confirmed") confirmed.push(doc);
      else review.push(doc);
    }
    return { reviewDocs: review, confirmedDocs: confirmed };
  }, [filteredDocuments]);

  // Group filtered confirmed documents by type.
  const confirmedGroups = useMemo(
    () => groupByType(filteredConfirmedDocs),
    [filteredConfirmedDocs],
  );

  // Available types for filter chips (from all documents, not filtered)
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const doc of documents) {
      types.add(doc.document_type ?? "other");
    }
    return FOLDER_ORDER.filter((key) => types.has(key));
  }, [documents]);

  // The folder that contains the auto-expanded document (from ?doc=ID).
  // We auto-open that folder so the user sees the referenced document.
  const autoOpenFolder = useMemo(() => {
    if (!expandedDocId) return null;
    const doc = documents.find((d) => d.id === expandedDocId);
    return doc?.document_type ?? "other";
  }, [expandedDocId, documents]);

  const libraryMoment = useMemo(
    () =>
      getLibraryMoment({
        totalDocuments: documents.length,
        reviewCount: reviewDocs.length,
        confirmedCount: confirmedDocs.length,
        uploadCount: uploads.length,
      }),
    [documents.length, reviewDocs.length, confirmedDocs.length, uploads.length],
  );
  const LibraryMomentIcon = libraryMoment.icon;

  return (
    <div
      ref={dropZoneRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="space-y-4 overflow-x-hidden"
    >
      <div className="relative overflow-hidden rounded-ordilo-md border border-border p-4 shadow-card">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--sand)] to-[var(--sand-light)]" />
        <div
          className="absolute -top-12 right-0 size-36 rounded-full bg-[var(--petrol)] opacity-[0.05] blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Dokumente
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {hasDocuments
                ? "Alles schön gesammelt, sortiert und schnell wiedergefunden."
                : "Alles an einem Ort, warm sortiert und schnell wieder da."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <HeaderStatPill label="Dokumente" value={documents.length} active />
              <HeaderStatPill
                label="Zum Durchsehen"
                value={reviewDocs.length}
                tone="apricot"
              />
              <HeaderStatPill
                label="Im Familienbuch"
                value={confirmedDocs.length}
                tone="petrol"
              />
            </div>
            <div className="mt-3 inline-flex max-w-2xl items-center gap-2 rounded-ordilo-sm border border-white/70 bg-white/75 px-2.5 py-2 shadow-sm">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--sand)]">
                <LibraryMomentIcon
                  className="size-3.5 text-[var(--petrol)]"
                  aria-hidden="true"
                />
              </div>
              <p className="min-w-0 text-xs text-[var(--mist-dark)]">
                <span className="font-medium text-foreground">
                  {libraryMoment.label}
                </span>{" "}
                <span>{libraryMoment.detail}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {hasDocuments && (
              <div
                className="flex shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-white/80 p-0.5 shadow-sm"
                role="tablist"
                aria-label="Ansicht wählen"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "folder"}
                  onClick={() => setView("folder")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    view === "folder"
                      ? "bg-[var(--petrol)] text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="documents-view-folder"
                >
                  <Folder className="size-3.5" aria-hidden="true" />
                  Ordner
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "table"}
                  onClick={() => setView("table")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    view === "table"
                      ? "bg-[var(--petrol)] text-white"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="documents-view-table"
                >
                  <Table2 className="size-3.5" aria-hidden="true" />
                  Tabelle
                </button>
              </div>
            )}

            {hasDocuments && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => pdfInputRef.current?.click()}
                className="bg-white/80"
              >
                <UploadCloud className="size-4" aria-hidden="true" />
                Hochladen
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openCreateNote}
              className="shrink-0 bg-white/80"
              data-testid="open-create-note-button"
            >
              <FileText className="size-4" aria-hidden="true" />
              Anlegen
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={openWizard}
              className="shrink-0"
              data-testid="open-scan-wizard-button"
            >
              <Camera className="size-4" aria-hidden="true" />
              Scannen
            </Button>
          </div>
        </div>
      </div>

      {hasDocuments && !loadingDocs && view === "folder" && (
        <div
          className="rounded-ordilo-md border border-border bg-card/95 p-3 shadow-card"
          data-testid="dokumente-search-filter"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                Ordner schneller eingrenzen
              </p>
              <p className="text-xs text-muted-foreground">
                Suche, Status und Typen helfen dir beim kurzen Durchsehen.
              </p>
            </div>
            {(searchQuery || statusFilter !== "all" || typeFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setTypeFilter(null);
                }}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" aria-hidden="true" />
                Filter löschen
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-ordilo-sm border border-border bg-[var(--sand)] px-2.5 py-2 shadow-sm">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Dokument suchen..."
                aria-label="Dokument suchen"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Suche löschen"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSortBy(sortBy === "date" ? "title" : sortBy === "title" ? "type" : "date")}
                className="flex shrink-0 items-center gap-1 rounded-ordilo-sm px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={`Sortieren nach ${sortBy === "date" ? "Datum" : sortBy === "title" ? "Titel" : "Typ"}`}
              >
                <ArrowUpDown className="size-3" aria-hidden="true" />
                {sortBy === "date" ? "Datum" : sortBy === "title" ? "Titel" : "Typ"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <FilterChip
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              label="Alle"
              count={documents.length}
            />
            <FilterChip
              active={statusFilter === "pending"}
              onClick={() => setStatusFilter("pending")}
              label="Durchsehen"
              count={reviewDocs.length}
              variant="pending"
            />
            <FilterChip
              active={statusFilter === "confirmed"}
              onClick={() => setStatusFilter("confirmed")}
              label="Familienbuch"
              count={confirmedDocs.length}
              variant="confirmed"
            />

            {availableTypes.length > 1 && (
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
            )}

            {availableTypes.map((typeKey) => {
              const config = FOLDER_CONFIG[typeKey] ?? FOLDER_CONFIG.other;
              const count = documents.filter((d) => (d.document_type ?? "other") === typeKey).length;
              return (
                <FilterChip
                  key={typeKey}
                  active={typeFilter === typeKey}
                  onClick={() => setTypeFilter(typeFilter === typeKey ? null : typeKey)}
                  label={config.label}
                  count={count}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="flex flex-col items-center justify-center rounded-ordilo-sm border-2 border-dashed border-[var(--petrol)] bg-[var(--blue-soft)] py-8 text-center">
          <UploadCloud
            className="size-12 text-[var(--petrol)]"
            strokeWidth={1.5}
          />
          <p className="mt-3 font-medium text-[var(--petrol)]">
            Datei hier ablegen
          </p>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraSelect}
        aria-label="Foto mit Kamera aufnehmen"
        data-testid="camera-input"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept={ACCEPTED_FILE_EXTENSIONS}
        className="hidden"
        onChange={handlePdfSelect}
        aria-label="PDF oder Bild hochladen"
        data-testid="pdf-input"
      />

      {/* Active uploads */}
      {hasActiveUploads && (
        <div className="space-y-3" data-testid="upload-progress-list">
          {uploads.map((upload) => (
            <UploadProgressCard
              key={upload.id}
              upload={upload}
              onRetry={() => handleRetry(upload.id)}
              onDismiss={() => dismissUpload(upload.id)}
            />
          ))}
        </div>
      )}

      {/* Document library / empty state */}
      {loadingDocs ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : hasDocuments ? (
        <div className="space-y-3" data-testid="document-list">
          {view === "table" ? (
            <DocumentsTable
              key={docIdsKey}
              documents={documents}
            />
          ) : (
            <>
              {/* Zu bestätigen — documents that need review */}
              {filteredReviewDocs.length > 0 && (
                <div data-testid="review-queue">
                  <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <FileText className="size-3.5" aria-hidden="true" />
                    Zum Durchsehen
                    <span className="text-xs font-normal tabular-nums">{filteredReviewDocs.length}</span>
                  </h2>
                  <div className="grid gap-1.5 md:grid-cols-2">
                    {filteredReviewDocs.map((doc) => (
                      <DocumentCard
                        key={doc.id}
                        title={doc.title}
                        originalFilename={doc.original_filename}
                        mimeType={doc.mime_type}
                        status={doc.status}
                        createdAt={doc.created_at}
                        errorMessage={doc.error_message}
                        documentType={doc.document_type}
                        onClick={() =>
                          expandedDocId === doc.id
                            ? closeDocument()
                            : void openDocument(doc.id)
                        }
                        onRetry={
                          doc.status === "failed"
                            ? () => handleRetryFailed(doc.id)
                            : undefined
                        }
                        onDelete={() => setDeleteConfirmId(doc.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Folder sections for confirmed documents */}
              {filteredConfirmedDocs.length > 0 && (
                <div className="space-y-1.5" data-testid="folder-list">
                  <h2 className="text-xs font-semibold text-muted-foreground">
                    Im Familienbuch
                  </h2>
                  {FOLDER_ORDER.filter((key) => confirmedGroups.has(key)).map((key) => (
                    <FolderSection
                      key={key}
                      folderKey={key}
                      docs={confirmedGroups.get(key)!}
                      expandedDocId={expandedDocId}
                      openDocument={openDocument}
                      closeDocument={closeDocument}
                      onRetryFailed={handleRetryFailed}
                      onDeleteDocument={(id) => setDeleteConfirmId(id)}
                      defaultOpen={autoOpenFolder === key ? true : undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <EmptyState
            title="Noch nichts gescannt"
            description="Halte die Kamera auf ein Dokument — oder leg gleich eine Notiz an."
            icon={ScanLine}
            actionLabel="Dokument scannen"
            onAction={openWizard}
          />
          <button
            type="button"
            onClick={openCreateNote}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol)]/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="empty-state-create-note"
          >
            <FileText className="size-4" aria-hidden="true" />
            Notiz anlegen
          </button>
        </div>
      )}

      {/* Compact upload link at the bottom */}
      {hasDocuments && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-ordilo-sm border border-dashed border-border bg-[var(--sand)] px-3 py-2 text-xs text-muted-foreground">
          <UploadCloud className="size-3.5 text-[var(--petrol)]" aria-hidden="true" />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="font-medium text-[var(--petrol)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            PDF hochladen
          </button>
          <span aria-hidden="true">·</span>
          <span>oder Datei hierher fallen lassen</span>
        </div>
      )}

      {/* Delete confirmation sheet */}
      <Sheet
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <SheetContent side="bottom" data-testid="delete-confirm-sheet">
          <SheetHeader>
            <SheetTitle>Dokument löschen?</SheetTitle>
            <SheetDescription>
              Das Dokument wird für immer entfernt. Vielleicht vorher noch kurz durchschauen?
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteConfirmId(null)}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={async () => {
                if (!deleteConfirmId) return;
                await handleDeleteDocument(deleteConfirmId);
                setDeleteConfirmId(null);
                closeDocument();
                toast.success("Dokument entfernt");
              }}
              data-testid="confirm-delete-button"
            >
              Löschen
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function HeaderStatPill({
  label,
  value,
  tone = "default",
  active = false,
}: {
  label: string;
  value: number | null;
  tone?: "default" | "petrol" | "apricot";
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        active
          ? "border-[var(--petrol)] bg-[var(--petrol)] text-white"
          : tone === "petrol"
            ? "border-[var(--petrol)]/20 bg-[var(--petrol)]/10 text-[var(--petrol)]"
            : tone === "apricot"
              ? "border-[var(--apricot)]/20 bg-[var(--apricot)]/10 text-[var(--apricot)]"
              : "border-border bg-white/80 text-muted-foreground",
      )}
    >
      <span>{label}</span>
      {value !== null && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] tabular-nums",
            active ? "bg-white/20" : "bg-white/70 text-foreground/80",
          )}
        >
          {value}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FilterChip — compact pill for status/type filters
// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  label,
  count,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  variant?: "pending" | "confirmed";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? variant === "pending"
            ? "border-[var(--apricot)]/30 bg-[var(--apricot)]/10 text-[var(--apricot)]"
            : variant === "confirmed"
              ? "border-[var(--petrol)]/30 bg-[var(--petrol)]/10 text-[var(--petrol)]"
              : "border-[var(--petrol)] bg-[var(--petrol)] text-white"
          : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1 text-[10px] tabular-nums",
          active ? "bg-white/20" : "bg-secondary",
        )}
      >
        {count}
      </span>
    </button>
  );
}
