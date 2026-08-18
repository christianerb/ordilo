"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  UploadCloud,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileText,
  Plus,
} from "lucide-react";
import { ACCEPTED_FILE_EXTENSIONS } from "@/lib/schemas/document";
import { DocumentsBrowser } from "@/components/ordilo/documents-browser";
import { EmptyState } from "@/components/ordilo/empty-state";
import { Button } from "@/components/ui/button";
import {
  OrdiloDrawer,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { UploadProgressCard } from "@/components/ordilo/scan-wizard/upload-progress";
import { useScan } from "@/lib/scan/scan-context";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import { toast } from "sonner";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { OrdiloSegmentedNav } from "@/components/ordilo/ordilo-segmented-nav";
import { formatGermanDate } from "@/lib/format";
import { ContactsView } from "./contacts-view";
import type { ContactRow } from "./actions";
import { InboundEmailAddressCard } from "@/components/ordilo/inbound-email-address-card";

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
  initialContacts = [],
  initialNotePreviews = {},
  inboundEmail,
}: {
  initialDocuments: DocumentRow[];
  initialContacts?: ContactRow[];
  initialNotePreviews?: Record<string, string>;
  inboundEmail?: string | null;
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
    openCreateNote,
  } = useScan();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const currentTab = useSearchParams().get("tab");
  const view =
    currentTab === "notizen"
      ? "notizen"
      : currentTab === "kontakte"
        ? "kontakte"
        : "dokumente";

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
  const libraryDocuments = useMemo(
    () => displayDocuments.filter((document) => document.source !== "manual"),
    [displayDocuments],
  );
  const noteDocuments = useMemo(
    () => displayDocuments.filter((document) => document.source === "manual"),
    [displayDocuments],
  );
  const activeDocuments = view === "notizen" ? noteDocuments : libraryDocuments;
  const hasDocuments = activeDocuments.length > 0;
  const hasActiveUploads = uploads.length > 0;
  const activeCount =
    view === "kontakte"
      ? initialContacts.filter((contact) => contact.status === "confirmed").length
      : activeDocuments.length;

  return (
    <div
      ref={view === "dokumente" ? dropZoneRef : undefined}
      onDragEnter={view === "dokumente" ? handleDragEnter : undefined}
      onDragOver={view === "dokumente" ? handleDragOver : undefined}
      onDragLeave={view === "dokumente" ? handleDragLeave : undefined}
      onDrop={view === "dokumente" ? handleDrop : undefined}
      className="app-page-stack overflow-x-hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--petrol)]">
            Dokumente
          </h1>
          <span className="rounded-full bg-[var(--sand-warm)] px-2.5 py-0.5 text-sm font-medium tabular-nums text-[var(--mist-dark)]">
            {activeCount}
          </span>
        </div>
        {view === "notizen" && (
          <Button
            size="icon"
            className="size-11 shrink-0 rounded-full"
            onClick={() => openCreateNote()}
            aria-label="Neue Notiz"
          >
            <Plus className="size-5" />
          </Button>
        )}
      </div>

      <section className="rounded-ordilo-md bg-[var(--sand-light)] pb-1">
        <OrdiloSegmentedNav
          label="Ansicht in Dokumente"
          items={[
            { href: "/dokumente", label: "Dokumente", active: view === "dokumente" },
            {
              href: "/dokumente?tab=notizen",
              label: "Notizen",
              active: view === "notizen",
            },
            {
              href: "/dokumente?tab=kontakte",
              label: "Kontakte",
              active: view === "kontakte",
            },
          ]}
          testId="documents-view-switcher"
          variant="morphing"
        />
        <div className="relative z-10 mx-1 rounded-b-[16px] rounded-tr-[16px] bg-[var(--surface-box)] p-3">
        {view === "kontakte" ? (
        <ContactsView
          key={initialContacts
            .map((contact) => `${contact.id}:${contact.status}:${contact.updated_at}`)
            .join("|")}
          initialContacts={initialContacts}
          onOpenSource={(documentId) => void openDocument(documentId)}
        />
      ) : view === "notizen" ? (
        <NotesView
          notes={noteDocuments}
          previews={initialNotePreviews}
          loading={loadingDocs}
          onCreate={() => openCreateNote()}
          onOpen={(documentId) => void openDocument(documentId)}
        />
      ) : (
        <>
      {inboundEmail && <InboundEmailAddressCard email={inboundEmail} />}

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
          <DocumentsBrowser
            documents={libraryDocuments}
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
        </>
      )}
        </div>
      </section>

      {/* Delete confirmation drawer */}
      <OrdiloDrawer
        variant="form"
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
        data-testid="delete-confirm-sheet"
      >
        <OrdiloDrawerHeader
          title="Dokument löschen?"
          description="Das Dokument wird für immer entfernt. Vielleicht vorher noch kurz durchschauen?"
        />
        <OrdiloDrawerFooter>
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
        </OrdiloDrawerFooter>
      </OrdiloDrawer>
    </div>
  );
}

function NotesView({
  notes,
  loading,
  previews,
  onCreate,
  onOpen,
}: {
  notes: DocumentRow[];
  loading: boolean;
  previews: Record<string, string>;
  onCreate: () => void;
  onOpen: (documentId: string) => void;
}) {
  if (loading && notes.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <EmptyState
        title="Noch keine Notizen"
        description="Halte Familienwissen fest, bevor es wieder jemand im Kopf behalten muss."
        actionLabel="Notiz schreiben"
        onAction={onCreate}
      />
    );
  }

  return (
    <div
      className="divide-y divide-border overflow-hidden rounded-ordilo-sm border border-border bg-[var(--sand)] shadow-card animate-card-in"
      data-testid="notes-list"
    >
      {notes.map((note) => (
        <button
          type="button"
          key={note.id}
          onClick={() => onOpen(note.id)}
          className="flex min-h-20 w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--sand-warm)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--sand-light)]">
            <FileText className="size-4.5 text-[var(--mist-dark)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {note.title?.trim() || "Notiz"}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {note.summary?.trim() ||
                previews[note.id] ||
                note.ocr_text?.trim() ||
                "Notiz öffnen, um den Inhalt zu lesen"}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatGermanDate(note.created_at)}
          </span>
        </button>
      ))}
    </div>
  );
}
