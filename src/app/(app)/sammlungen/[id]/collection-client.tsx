"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Pencil, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import type { Database } from "@/types/database";
import { DocumentCard } from "@/components/ordilo/document-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import {
  CollectionForm,
  type CollectionFormValues,
} from "@/components/ordilo/collection-form";
import { getCollectionIcon, getCollectionColor } from "@/lib/schemas/collections";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CollectionFolder } from "@/components/ordilo/collection-folder";
import { updateCollection, deleteCollection } from "../actions";
import { useDocumentViewer, useScanActions } from "@/lib/scan/scan-context";

type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
type DocumentRow = Pick<
  Database["public"]["Tables"]["documents"]["Row"],
  | "id"
  | "title"
  | "original_filename"
  | "mime_type"
  | "status"
  | "document_type"
  | "created_at"
>;

export interface CollectionClientProps {
  collection: CollectionRow;
  documents: DocumentRow[];
}

/**
 * Collection detail page (client component).
 *
 * Shows all documents whose `category` matches the collection, plus edit
 * (rename/icon/color) and delete affordances.
 */
export function CollectionClient({
  collection,
  documents,
}: CollectionClientProps) {
  const router = useRouter();
  const { openWizard, openCreateNote } = useScanActions();
  const { openDocument } = useDocumentViewer();
  const [current, setCurrent] = useState(collection);

  const [editOpen, setEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const Icon = getCollectionIcon(current.icon);
  const colorOption = getCollectionColor(current.color);

  const handleEditSubmit = useCallback(
    async (values: CollectionFormValues) => {
      setServerError(null);
      setIsSubmitting(true);
      const result = await updateCollection(current.id, values);
      setIsSubmitting(false);

      if (!result.success) {
        setServerError(result.error);
        return;
      }

      setCurrent(result.data);
      setEditOpen(false);
      router.refresh();
    },
    [current.id, router],
  );

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    const result = await deleteCollection(current.id);
    setIsDeleting(false);

    if (!result.success) {
      setDeleteError(result.error);
      return;
    }

    router.push("/home");
    router.refresh();
  }, [current.id, router]);

  const handleDocClick = useCallback(
    (docId: string) => {
      void openDocument(docId);
    },
    [openDocument],
  );

  // File a quick note directly into this collection (no scanning). The
  // collection's name becomes the note's category, so it lands here.
  const handleAddNote = useCallback(() => {
    openCreateNote({ category: current.name });
  }, [openCreateNote, current.name]);

  return (
    <div className="app-page-stack">
      <CollectionFolder
        name={current.name}
        documentCount={documents.length}
        Icon={Icon}
        color={colorOption}
        actions={
          <>
          <button
            type="button"
            onClick={handleAddNote}
            className="flex size-9 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Notiz hinzufügen"
            data-testid="collection-add-note"
          >
            <FilePlus2 className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setServerError(null);
              setEditOpen(true);
            }}
            className="flex size-9 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Bearbeiten"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            className="flex size-9 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Sammlung löschen"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
          </>
        }
      />

      {/* Document list or empty state */}
      {documents.length === 0 ? (
        <EmptyState
          icon={Icon}
          title="Noch keine Dokumente hier"
          description="Dokumente landen hier automatisch, sobald ihre Kategorie zu dieser Sammlung passt. Oder schreib einfach kurz selbst etwas rein."
          actionLabel="Dokument scannen"
          onAction={openWizard}
          secondaryActionLabel="Notiz schreiben"
          onSecondaryAction={handleAddNote}
        />
      ) : (
        <div className="space-y-2 stagger-children lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              title={doc.title}
              originalFilename={doc.original_filename}
              mimeType={doc.mime_type}
              status={doc.status}
              createdAt={doc.created_at}
              documentType={doc.document_type}
              onClick={() => handleDocClick(doc.id)}
            />
          ))}
        </div>
      )}

      {/* Edit drawer */}
      <OrdiloDrawer variant="form" open={editOpen} onOpenChange={setEditOpen}>
        <OrdiloDrawerHeader
          title="Sammlung bearbeiten"
          description="Ändere Name, Icon oder Farbe dieser Sammlung."
        />
        <OrdiloDrawerBody>
          <CollectionForm
            initialValues={{
              name: current.name,
              icon: current.icon,
              color: current.color,
            }}
            submitLabel="Änderungen speichern"
            onSubmit={handleEditSubmit}
            isSubmitting={isSubmitting}
            serverError={serverError}
            onClearServerError={() => setServerError(null)}
          />
        </OrdiloDrawerBody>
      </OrdiloDrawer>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md rounded-ordilo-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--destructive)" }}
              >
                <AlertTriangle className="size-5 text-white" />
              </div>
              <div>
                <DialogTitle>Sammlung löschen</DialogTitle>
                <DialogDescription>
                  Möchtest du{" "}
                  <span className="font-semibold text-foreground">
                    {current.name}
                  </span>{" "}
                  wirklich löschen? Keine Sorge, die Dokumente bleiben erhalten.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {deleteError && (
            <div
              role="alert"
              className="rounded-ordilo-md border border-destructive/30 bg-destructive/5 px-4 py-3"
            >
              <p className="text-sm font-medium text-destructive">
                {deleteError}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="h-12 w-full rounded-ordilo-md"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wird gelöscht…
                </>
              ) : (
                "Löschen"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isDeleting}
              onClick={() => setDeleteOpen(false)}
              className="h-12 w-full rounded-ordilo-md"
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
