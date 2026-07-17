"use client";

import { useState, useRef, useCallback } from "react";
import {
  Camera,
  Images,
  Loader2,
  FileText,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NoteEditor } from "@/components/ordilo/note-editor";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/schemas/extraction";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateNoteSheetProps {
  /** Whether the sheet is open. */
  open: boolean;
  /** Called when the sheet should close. */
  onOpenChange: (open: boolean) => void;
  /** Called when the user submits the note. */
  onSubmit: (params: {
    title: string;
    content: string;
    documentType: DocumentType;
    file: File | null;
  }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Document type selector
// ---------------------------------------------------------------------------

const TYPE_ICONS: Partial<Record<DocumentType, LucideIcon>> = {
  invoice: FileText,
  letter: FileText,
  contract: FileText,
  medical: FileText,
  school: FileText,
  insurance: FileText,
  tax: FileText,
  other: FileText,
};

function DocumentTypeSelector({
  value,
  onChange,
}: {
  value: DocumentType;
  onChange: (type: DocumentType) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DOCUMENT_TYPES.map((type) => {
        const Icon = TYPE_ICONS[type] ?? FileText;
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "border-[var(--petrol)] bg-[var(--petrol)] text-white"
                : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
            aria-pressed={active}
          >
            <Icon className="size-3" aria-hidden="true" />
            {DOCUMENT_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Create Note Sheet — a bottom/right slide-in panel for manually creating
 * a document with a title, markdown text body, document type selection,
 * and an optional image attachment.
 *
 * On submit, calls onSubmit which handles the API call and pipeline
 * triggering. The sheet shows a loading state while submitting.
 */
export function CreateNoteSheet({
  open,
  onOpenChange,
  onSubmit,
}: CreateNoteSheetProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("other");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setTitle("");
    setContent("");
    setDocumentType("other");
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setError(null);
  }, [imagePreview]);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open && !submitting) {
        reset();
      }
      onOpenChange(open);
    },
    [onOpenChange, reset, submitting],
  );

  const handleImageSelect = useCallback(
    (file: File) => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    },
    [imagePreview],
  );

  const handleRemoveImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }, [imagePreview]);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (!trimmedContent) {
      setError("Bitte schreib etwas in die Notiz.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: trimmedTitle,
        content: trimmedContent,
        documentType,
        file: imageFile,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Notiz konnte nicht gespeichert werden.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [title, content, documentType, imageFile, onSubmit, reset, onOpenChange]);

  const canSubmit = title.trim() && content.trim() && !submitting;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="bottom"
        className={cn(
          "flex max-h-[92dvh] flex-col gap-0 rounded-t-ordilo-xl p-0",
          "lg:max-w-lg lg:mx-auto lg:rounded-t-ordilo-xl",
        )}
        data-testid="create-note-sheet"
      >
        <SheetHeader className="border-b border-border bg-[var(--sand)]/70 px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-[15px]">
            <FileText
              className="size-4 shrink-0 text-[var(--mist-dark)]"
              aria-hidden="true"
            />
            Dokument anlegen
          </SheetTitle>
          <SheetDescription className="sr-only">
            Ein Dokument mit eigener Notiz anlegen
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="note-title">Titel</Label>
              <input
                id="note-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z. B. Arztbesuch Notiz, Idee fur Urlaub ..."
                maxLength={200}
                className="w-full rounded-ordilo-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--petrol)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="note-title-input"
              />
            </div>

            {/* Document type */}
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <DocumentTypeSelector value={documentType} onChange={setDocumentType} />
            </div>

            {/* Note editor */}
            <div className="space-y-1.5">
              <Label>Notiz</Label>
              <NoteEditor
                value={content}
                onChange={setContent}
                imagePreview={imagePreview}
                onRemoveImage={handleRemoveImage}
              />
            </div>

            {/* Image attachment */}
            <div className="flex items-center gap-2">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelect(file);
                  if (cameraRef.current) cameraRef.current.value = "";
                }}
                aria-label="Foto aufnehmen"
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelect(file);
                  if (galleryRef.current) galleryRef.current.value = "";
                }}
                aria-label="Bild aus Galerie wählen"
              />
              {!imageFile && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera className="size-4" aria-hidden="true" />
                    Foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => galleryRef.current?.click()}
                  >
                    <Images className="size-4" aria-hidden="true" />
                    Bild
                  </Button>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <p
                className="text-sm text-destructive"
                data-testid="note-error"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border px-5 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="note-submit-button"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Wird gespeichert ...
              </>
            ) : (
              "Anlegen & analysieren"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
