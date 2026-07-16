"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Camera,
  UploadCloud,
  Loader2,
  Folder,
  X,
  Plus,
  Settings2,
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
import { toast } from "sonner";
import { OrdiloMascot } from "@/components/ordilo/mascot";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Dokumente page — the family's document library.
 * A filterable, sortable table of all family documents.
 */
export default function DokumentePage() {
  const {
    documents,
    loadingDocs,
    loadDocuments,
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

  // Auto-switch to table view on desktop
  useMountEffect(() => {
    if (typeof window === "undefined") return;
    void loadDocuments();
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

  const hasDocuments = documents.length > 0;
  const hasActiveUploads = uploads.length > 0;

  // Remounts the table (and its metadata fetch) when the document set
  // itself changes, per the key-remount convention (see ReviewCard).
  const docIdsKey = useMemo(
    () => documents.map((d) => d.id).sort().join(","),
    [documents],
  );
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
    <div
      ref={dropZoneRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="space-y-4 overflow-x-hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Dokumente
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {documents.length}
          </span>
        </h1>
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
      {loadingDocs ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : hasDocuments ? (
        <div className="space-y-3" data-testid="document-list">
          <DocumentsTable
            key={docIdsKey}
            documents={documents}
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
