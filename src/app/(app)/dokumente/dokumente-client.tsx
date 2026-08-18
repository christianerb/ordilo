"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  UploadCloud,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileText,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { ACCEPTED_FILE_EXTENSIONS } from "@/lib/schemas/document";
import { DocumentsBrowser } from "@/components/ordilo/documents-browser";
import { EmptyState } from "@/components/ordilo/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  LibraryList,
  LibraryNoResults,
  LibraryPageHeader,
  LibraryRow,
  LibrarySearchField,
  LibraryTile,
  LibraryToolbar,
} from "@/components/ordilo/library-surface";
import { formatGermanDate } from "@/lib/format";
import { ContactsView } from "./contacts-view";
import type { ContactRow } from "./actions";

type LibraryView = "dokumente" | "notizen" | "kontakte";

/** One line under the page title, so each tab says what it is for. */
const VIEW_DESCRIPTIONS: Record<LibraryView, string> = {
  dokumente: "Alles Wichtige an einem Ort — gescannt, gelesen, einsortiert.",
  notizen: "Kurze Notizen für alles, was sonst nur einer im Kopf hat.",
  kontakte: "Nummern und Adressen, die du im Alltag wirklich brauchst.",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Dokumente client — the family's document library.
 *
 * Three tabs on one page: scanned documents, hand-written notes, and the
 * contacts found in them. They share the page header, the search toolbar
 * and one grouped list, so switching tabs stays a switch of content and
 * not of layout.
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
    seedDocuments,
    openDocument,
    closeDocument,
    handleDeleteDocument,
    openCreateNote,
    openWizard,
  } = useScan();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const currentTab = useSearchParams().get("tab");
  const view: LibraryView =
    currentTab === "notizen"
      ? "notizen"
      : currentTab === "kontakte"
        ? "kontakte"
        : "dokumente";

  // Track which direction the tabs slid so the content follows — the
  // journal has pages you flip, not slots that swap.
  const VIEW_ORDER: LibraryView[] = ["dokumente", "notizen", "kontakte"];
  const prevViewIndex = useRef<number>(VIEW_ORDER.indexOf(view));
  const currentIndex = VIEW_ORDER.indexOf(view);
  const slideClass =
    currentIndex > prevViewIndex.current
      ? "animate-panel-right"
      : currentIndex < prevViewIndex.current
        ? "animate-panel-left"
        : "animate-card-in";
  prevViewIndex.current = currentIndex;

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
  const confirmedContacts = initialContacts.filter(
    (contact) => contact.status === "confirmed",
  );
  const activeCount =
    view === "kontakte"
      ? confirmedContacts.length
      : view === "notizen"
        ? noteDocuments.length
        : libraryDocuments.length;

  // A note and a scan are deleted the same way, but they are not the same
  // thing to lose — the confirmation says which one is about to go.
  const deleteTarget = displayDocuments.find((doc) => doc.id === deleteConfirmId);
  const deletingNote = deleteTarget?.source === "manual";

  function handleCreate() {
    if (view === "notizen") {
      openCreateNote();
      return;
    }
    if (view === "kontakte") {
      setContactFormOpen(true);
      return;
    }
    openWizard();
  }

  return (
    <div className="app-page-stack overflow-x-hidden">
      <LibraryPageHeader
        title="Dokumente"
        count={activeCount}
        description={VIEW_DESCRIPTIONS[view]}
        action={
          <Button
            type="button"
            onClick={handleCreate}
            className="h-11 gap-2 rounded-full px-3 sm:px-4"
            data-testid="library-create-button"
          >
            <span
              className="flex size-6 items-center justify-center rounded-full bg-white/20"
              aria-hidden="true"
            >
              <Plus className="size-4" />
            </span>
            <span className="sr-only sm:not-sr-only">Neu erstellen</span>
          </Button>
        }
      />

      <OrdiloSegmentedNav
        label="Ansicht in Dokumente"
        items={[
          {
            href: "/dokumente",
            label: "Dokumente",
            active: view === "dokumente",
            icon: FileText,
            count: libraryDocuments.length,
          },
          {
            href: "/dokumente?tab=notizen",
            label: "Notizen",
            active: view === "notizen",
            icon: NotebookPen,
            count: noteDocuments.length,
          },
          {
            href: "/dokumente?tab=kontakte",
            label: "Kontakte",
            active: view === "kontakte",
            icon: Users,
            count: confirmedContacts.length,
          },
        ]}
        testId="documents-view-switcher"
      />

      {/* Keyed on the view so switching tabs plays the content in
          rather than swapping it in place. */}
      <div key={view} className={slideClass}>
        {view === "kontakte" ? (
          <ContactsView
            key={initialContacts
              .map(
                (contact) =>
                  `${contact.id}:${contact.status}:${contact.updated_at}`,
              )
              .join("|")}
            initialContacts={initialContacts}
            formOpen={contactFormOpen}
            onFormOpenChange={setContactFormOpen}
            onOpenSource={(documentId) => void openDocument(documentId)}
          />
        ) : view === "notizen" ? (
          <NotesView
            notes={noteDocuments}
            previews={initialNotePreviews}
            loading={loadingDocs}
            onCreate={() => openCreateNote()}
            onOpen={(documentId) => void openDocument(documentId)}
            onDelete={setDeleteConfirmId}
          />
        ) : (
          <DocumentsView
            documents={libraryDocuments}
            onDelete={setDeleteConfirmId}
          />
        )}
      </div>

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
          title={deletingNote ? "Notiz löschen?" : "Dokument löschen?"}
          description={
            deletingNote
              ? "Die Notiz wird für immer entfernt. Vielleicht vorher noch kurz nachlesen?"
              : "Das Dokument wird für immer entfernt. Vielleicht vorher noch kurz durchschauen?"
          }
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
              const wasNote = deletingNote;
              const deleted = await handleDeleteDocument(deleteConfirmId);
              setDeleteConfirmId(null);
              closeDocument();
              // On failure handleDeleteDocument restores the row and shows
              // its own error toast — do not also claim success.
              if (deleted) toast.success(wasNote ? "Notiz entfernt" : "Dokument entfernt");
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

// ---------------------------------------------------------------------------
// Dokumente tab
// ---------------------------------------------------------------------------

/**
 * The scanned library, plus everything that gets a document into it:
 * the drop zone, the hidden file inputs and the running uploads.
 */
function DocumentsView({
  documents,
  onDelete,
}: {
  documents: DocumentRow[];
  onDelete: (documentId: string) => void;
}) {
  const {
    loadingDocs,
    documentsError,
    loadDocuments,
    uploads,
    isDragOver,
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
    openWizard,
  } = useScan();

  const hasDocuments = documents.length > 0;

  return (
    <div
      ref={dropZoneRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="space-y-4"
    >
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
      {uploads.length > 0 && (
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
          className="flex flex-col items-center gap-3 rounded-ordilo-sm border border-border bg-[var(--surface-story)] p-8 text-center"
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
        <div className="space-y-4" data-testid="document-list">
          <DocumentsBrowser documents={documents} onDelete={onDelete} />
          {/* Compact upload hint below the list */}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-ordilo-sm border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <UploadCloud
              className="size-3.5 text-[var(--petrol)]"
              aria-hidden="true"
            />
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notizen tab
// ---------------------------------------------------------------------------

/**
 * Hand-written notes. Same list shape as the documents tab — a note is
 * just a document the family typed itself.
 */
function NotesView({
  notes,
  loading,
  previews,
  onCreate,
  onOpen,
  onDelete,
}: {
  notes: DocumentRow[];
  loading: boolean;
  previews: Record<string, string>;
  onCreate: () => void;
  onOpen: (documentId: string) => void;
  onDelete: (documentId: string) => void;
}) {
  const [search, setSearch] = useState("");

  function previewOf(note: DocumentRow) {
    return (
      note.summary?.trim() ||
      previews[note.id] ||
      note.ocr_text?.trim() ||
      "Notiz öffnen, um den Inhalt zu lesen"
    );
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de");
    if (!needle) return notes;
    return notes.filter((note) =>
      [note.title, note.summary, previews[note.id]]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de")
        .includes(needle),
    );
  }, [notes, previews, search]);

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
        icon={NotebookPen}
        actionLabel="Notiz schreiben"
        onAction={onCreate}
      />
    );
  }

  return (
    <div className="space-y-4">
      <LibraryToolbar>
        <LibrarySearchField
          value={search}
          onChange={setSearch}
          placeholder="Notizen durchsuchen …"
          label="Notizen durchsuchen"
          testId="notes-search-input"
        />
      </LibraryToolbar>

      {filtered.length === 0 ? (
        <LibraryNoResults
          message="Keine Notiz gefunden."
          hint="Vielleicht mit einem anderen Wort versuchen?"
          onReset={() => setSearch("")}
        />
      ) : (
        <LibraryList testId="notes-list">
          {filtered.map((note) => (
            <LibraryRow
              key={note.id}
              testId="notes-row"
              leading={<LibraryTile icon={NotebookPen} />}
              title={note.title?.trim() || "Notiz"}
              subtitle={previewOf(note)}
              actionLabel={`${note.title?.trim() || "Notiz"} öffnen`}
              onClick={() => onOpen(note.id)}
              meta={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatGermanDate(note.created_at)}
                </span>
              }
              trailing={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      aria-label={`Aktionen für ${note.title?.trim() || "Notiz"}`}
                      data-testid={`notes-row-menu-${note.id}`}
                    >
                      <MoreHorizontal className="size-4.5" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onOpen(note.id)}>
                      <FileText className="size-4" aria-hidden="true" />
                      Öffnen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onDelete(note.id)}
                      data-testid={`notes-row-delete-${note.id}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))}
        </LibraryList>
      )}
    </div>
  );
}
