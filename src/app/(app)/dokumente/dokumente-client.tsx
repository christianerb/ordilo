"use client";

import { useState, useCallback } from "react";
import {
  UploadCloud,
  Loader2,
  Folder,
  X,
  Plus,
  Settings2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ACCEPTED_FILE_EXTENSIONS } from "@/lib/schemas/document";
import {
  COLLECTION_ICON_OPTIONS,
  COLLECTION_COLOR_OPTIONS,
} from "@/lib/schemas/collections";
import { useCollections } from "@/lib/collections/collections-context";
import Link from "next/link";
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
import { PullToRefresh } from "@/components/ordilo/pull-to-refresh";

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

  const { collections, addCollection } = useCollections();
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

  const handleCreateCollection = useCallback(
    async (name: string) => {
      // Same defaults as the sidebar's CollectionForm — both entry points
      // derive them from the canonical option lists, so they can't drift.
      const result = await addCollection({
        name,
        icon: COLLECTION_ICON_OPTIONS[0].key,
        color: COLLECTION_COLOR_OPTIONS[0].key,
      });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success(`Sammlung „${result.data.name}" angelegt`);
      return true;
    },
    [addCollection],
  );

  // Until the provider's initial load lands, fall back to the
  // server-rendered documents so the page paints instantly (no spinner).
  // After that, the provider's live list wins — including when it is
  // empty (a family that really has no documents must not see stale SSR
  // rows after a delete).
  const displayDocuments =
    loadingDocs && documents.length === 0 ? initialDocuments : documents;
  const hasDocuments = displayDocuments.length > 0;
  const hasActiveUploads = uploads.length > 0;

  const collectionList = (
    <div className="mx-auto max-w-xs space-y-1.5">
      {collections.map((collection) => (
        <div
          key={collection.id}
          className="flex items-center gap-2 rounded-ordilo-sm border border-border bg-card px-3 py-2 text-sm text-foreground shadow-card"
        >
          <Folder className="size-4 shrink-0 text-[var(--petrol)]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{collection.name}</span>
          <Link
            href={`/sammlungen/${collection.id}`}
            aria-label={`Sammlung „${collection.name}" verwalten`}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings2 className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ))}
      <NewCollectionRow onCreate={handleCreateCollection} />
    </div>
  );

  return (
    <PullToRefresh onRefresh={loadDocuments}>
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
          <div className="lg:hidden">{collectionList}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <EmptyState
            title="Noch nichts gescannt"
            description="Halte die Kamera auf ein Dokument — Notizen und Uploads findest du gleich dort."
            mascotMood="greeting"
            actionLabel="Dokument scannen"
            onAction={openWizard}
          />
          {collectionList}
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
    </PullToRefresh>
  );
}

// ---------------------------------------------------------------------------
// NewCollectionRow — inline "+ Neue Sammlung" in the empty state
// ---------------------------------------------------------------------------

function NewCollectionRow({
  onCreate,
}: {
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const ok = await onCreate(trimmed);
      if (ok) {
        setName("");
        setOpen(false);
      }
    } catch {
      toast.error("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-ordilo-sm border border-dashed border-border px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-[var(--petrol)]/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid="new-collection-button"
      >
        <Plus className="size-4 shrink-0" aria-hidden="true" />
        Neue Sammlung
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
      className="flex items-center gap-2 rounded-ordilo-sm border border-border bg-card px-3 py-2 shadow-card"
      data-testid="new-collection-form"
    >
      <Folder className="size-4 shrink-0 text-[var(--petrol)]" aria-hidden="true" />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name der Sammlung"
        aria-label="Name der Sammlung"
        maxLength={50}
        autoFocus
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        data-testid="new-collection-name-input"
      />
      <Button
        type="submit"
        size="sm"
        disabled={!name.trim() || saving}
        data-testid="new-collection-submit"
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          "Anlegen"
        )}
      </Button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        aria-label="Abbrechen"
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
