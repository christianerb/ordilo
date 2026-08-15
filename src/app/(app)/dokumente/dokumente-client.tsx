"use client";

import { useState } from "react";
import {
  UploadCloud,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ACCEPTED_FILE_EXTENSIONS } from "@/lib/schemas/document";
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
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { UploadProgressCard } from "@/components/ordilo/scan-wizard/upload-progress";
import { useScan } from "@/lib/scan/scan-context";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import { toast } from "sonner";
import { OrdiloMascot } from "@/components/ordilo/mascot";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Dokumente client — the family's document library.
 * A filterable, sortable table of all family documents.
 *
 * Hybrid SSR: the server component (page.tsx) hands over the documents it
 * loaded server-side as `initialDocuments`, and this component renders
 * them for the first paint while the ScanProvider's own initial load is
 * still in flight. Once the provider has loaded, its live list takes over
 * and realtime/polling delta updates work exactly as before — the
 * provider remains the single source of truth for the document list.
 */
export function DokumenteClient({
  initialDocuments,
}: {
  initialDocuments: DocumentRow[];
}) {
  const {
    documents,
    loadingDocs,
    documentsError,
    loadDocuments,
    seedDocuments,
    uploads,
    isDragOver,
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
    handleDeleteDocument,
    openWizard,
  } = useScan();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Seed the provider from the server-rendered list instead of refetching
  // the full table — the server component already ran the exact same
  // query, and realtime/polling (wired up by the provider itself) takes
  // over from there. Seeding is a no-op when the provider already holds
  // live data from an earlier page in this session.
  useMountEffect(() => {
    if (typeof window === "undefined") return;
    seedDocuments(initialDocuments);
    const params = new URLSearchParams(window.location.search);
    const docId = params.get("doc");
    if (docId) {
      void openDocument(docId);
    }
  });

  // Until the provider's initial load lands, fall back to the
  // server-rendered documents so the page paints instantly (no spinner).
  // After that, the provider's live list wins — including when it is
  // empty (a family that really has no documents must not see stale SSR
  // rows after a delete).
  const displayDocuments =
    loadingDocs && documents.length === 0 ? initialDocuments : documents;
  const hasDocuments = displayDocuments.length > 0;
  const hasActiveUploads = uploads.length > 0;

  return (
    <div
      ref={dropZoneRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="app-page-stack overflow-x-hidden"
    >
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        Dokumente
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {displayDocuments.length}
        </span>
      </h1>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="flex flex-col items-center justify-center rounded-ordilo-sm border-2 border-dashed border-[var(--petrol)] bg-[var(--blue-soft)] py-8 text-center animate-card-in">
          <OrdiloMascot
            size={48}
            mood="helping"
            animate
            style={{ color: "var(--petrol)" }}
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
      {loadingDocs && !hasDocuments ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : documentsError && !hasDocuments ? (
        // A failed read must not masquerade as an empty family.
        <div
          className="flex flex-col items-center gap-3 rounded-ordilo-md border border-border bg-card p-8 text-center shadow-card"
          data-testid="documents-load-error"
        >
          <AlertCircle className="size-7 text-destructive" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">
            Deine Dokumente konnten nicht geladen werden
          </h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            {documentsError}
          </p>
          <Button
            type="button"
            size="lg"
            onClick={() => void loadDocuments()}
            className="mt-1 h-11 rounded-ordilo-md"
            data-testid="documents-load-retry"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Nochmal versuchen
          </Button>
        </div>
      ) : hasDocuments ? (
        <div className="space-y-3" data-testid="document-list">
          <DocumentsTable
            documents={displayDocuments}
            onDelete={setDeleteConfirmId}
          />
        </div>
      ) : (
        <EmptyState
          title="Noch nichts gescannt"
          description="Halte die Kamera auf ein Dokument — Notizen und Uploads findest du gleich dort."
          mascotMood="greeting"
          actionLabel="Dokument scannen"
          onAction={openWizard}
        />
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
                const deleted = await handleDeleteDocument(deleteConfirmId);
                setDeleteConfirmId(null);
                closeDocument();
                // On failure handleDeleteDocument restores the row and shows
                // its own error toast — do not also claim success.
                if (deleted) toast.success("Dokument entfernt");
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
