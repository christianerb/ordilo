"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UploadCloud,
  Loader2,
  FileText,
  NotebookPen,
  Plus,
  UsersRound,
} from "lucide-react";
import { ACCEPTED_FILE_EXTENSIONS } from "@/lib/schemas/document";
import { DocumentsBrowser } from "@/components/ordilo/documents-browser";
import { EmptyState } from "@/components/ordilo/empty-state";
import { ErrorState } from "@/components/ordilo/error-state";
import { ConfirmAction } from "@/components/ordilo/confirm-action";
import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { UploadProgressCard } from "@/components/ordilo/scan-wizard/upload-progress";
import { useScan } from "@/lib/scan/scan-context";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import { toast } from "sonner";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { OrdiloFilterTabs } from "@/components/ordilo/ordilo-filter-tabs";
import { AblageSearchInput } from "@/components/ordilo/ablage-search-input";
import { formatGermanDate } from "@/lib/format";
import { ContactsView } from "./contacts-view";
import type { ContactRow } from "./actions";

type FilingView = "dokumente" | "notizen" | "kontakte";

function getFilingView(tab: string | null): FilingView {
  if (tab === "notizen" || tab === "kontakte") return tab;
  return "dokumente";
}

function getFilingHref(view: FilingView): string {
  if (view === "notizen") return "/dokumente?tab=notizen";
  if (view === "kontakte") return "/dokumente?tab=kontakte";
  return "/dokumente";
}

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
}: {
  initialDocuments: DocumentRow[];
  initialContacts?: ContactRow[];
  initialNotePreviews?: Record<string, string>;
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
  const [contactCreateRequest, setContactCreateRequest] = useState(0);
  const router = useRouter();
  const routeView = getFilingView(useSearchParams().get("tab"));
  const [view, setView] = useState<FilingView>(routeView);
  const [renderedRouteView, setRenderedRouteView] = useState(routeView);
  // Browser back/forward and deep links still own the URL. A tab click updates
  // local state first, so the next view appears before the RSC navigation
  // finishes; this render-time adjustment only reconciles later URL changes.
  if (routeView !== renderedRouteView) {
    setRenderedRouteView(routeView);
    setView(routeView);
  }

  const handleViewChange = (nextView: FilingView) => {
    if (nextView === view) return;
    setView(nextView);
    router.push(getFilingHref(nextView));
  };

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
  const headerAction =
    view === "dokumente"
      ? {
          label: "Dokument hochladen",
          onClick: () => pdfInputRef.current?.click(),
        }
      : view === "notizen"
        ? {
            label: "Notiz schreiben",
            onClick: () => openCreateNote(),
          }
        : {
            label: "Kontakt hinzufügen",
            onClick: () => setContactCreateRequest((current) => current + 1),
          };

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
            Meine Ablage
          </h1>
          <span className="rounded-full bg-[var(--sand-warm)] px-2.5 py-0.5 text-sm font-medium tabular-nums text-[var(--mist-dark)]">
            {activeCount}
          </span>
        </div>
        <Button
          size="icon"
          aria-label={headerAction.label}
          title={headerAction.label}
          className="size-11 shrink-0 rounded-full"
          onClick={headerAction.onClick}
        >
          <Plus className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <OrdiloFilterTabs
        value={view}
        onChange={handleViewChange}
        ariaLabel="Ansicht in Dokumente"
        tabs={[
          { key: "dokumente", label: "Dokumente", icon: FileText },
          { key: "notizen", label: "Notizen", icon: NotebookPen },
          { key: "kontakte", label: "Kontakte", icon: UsersRound },
        ]}
        testId="documents-view-switcher"
      />

      {view === "kontakte" ? (
        <ContactsView
          key={initialContacts
            .map((contact) => `${contact.id}:${contact.status}:${contact.updated_at}`)
            .join("|")}
          initialContacts={initialContacts}
          onOpenSource={(documentId) => void openDocument(documentId)}
          createRequest={contactCreateRequest}
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
            <ErrorState
              title="Deine Dokumente konnten nicht geladen werden"
              description={documentsError}
              retryLabel="Nochmal versuchen"
              onRetry={() => void loadDocuments()}
              testId="documents-load-error"
            />
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
                className="font-medium text-[var(--petrol)] underline-offset-2 hover:underline focus-ring"
              >
                PDF hochladen
              </button>
              <span aria-hidden="true">·</span>
              <span>oder Datei hierher fallen lassen</span>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <ConfirmAction
        variant="drawer"
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
        title="Dokument löschen?"
        description="Das Dokument wird für immer entfernt. Vielleicht vorher noch kurz durchschauen?"
        confirmLabel="Löschen"
        onConfirm={async () => {
          if (!deleteConfirmId) return;
          const deleted = await handleDeleteDocument(deleteConfirmId);
          setDeleteConfirmId(null);
          closeDocument();
          // On failure handleDeleteDocument restores the row and shows
          // its own error toast — do not also claim success.
          if (deleted) toast.success("Dokument entfernt");
        }}
        testId="delete-confirm-sheet"
        confirmTestId="confirm-delete-button"
      />
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
  const [search, setSearch] = useState("");
  const visibleNotes = notes.filter((note) => {
    const needle = search.trim().toLocaleLowerCase("de");
    if (!needle) return true;
    return [note.title, note.summary, previews[note.id], note.ocr_text]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de")
      .includes(needle);
  });

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
    <div className="space-y-4">
      <AblageSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Notizen durchsuchen"
        ariaLabel="Notizen durchsuchen"
        testId="notes-search-input"
      />
      {visibleNotes.length === 0 ? (
        <p className="rounded-ordilo-md border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          Keine Notiz gefunden.
        </p>
      ) : (
        <div
          className="divide-y divide-border overflow-hidden rounded-ordilo-sm border border-border bg-[var(--sand)] shadow-card animate-card-in"
          data-testid="notes-list"
        >
          {visibleNotes.map((note) => (
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
      )}
    </div>
  );
}
