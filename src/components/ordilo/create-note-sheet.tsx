"use client";

import { useState, useRef, useCallback } from "react";
import {
  Camera,
  ChevronDown,
  Folder,
  Images,
  Loader2,
  FileText,
  Eye,
  EyeOff,
  Lock,
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
  /**
   * When set, the note is filed into this collection (its name becomes the
   * note's category) and a hint is shown so the user knows where it lands.
   */
  collectionName?: string;
  /** Called when the user submits the note. */
  onSubmit: (params: {
    title: string;
    content: string;
    documentType: DocumentType;
    secret: string;
    file: File | null;
  }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Document type selector
// ---------------------------------------------------------------------------

/**
 * Type picker as a dropdown.
 *
 * The nine types used to be a wrapped row of chips that ate four lines on a
 * phone and pushed the note editor below the fold. A plain `<select>` keeps
 * it to one line and, on iOS and Android, opens the OS picker — the control
 * people already know — instead of a custom overlay inside a bottom sheet.
 */
function DocumentTypeSelector({
  value,
  onChange,
}: {
  value: DocumentType;
  onChange: (type: DocumentType) => void;
}) {
  return (
    <div className="relative">
      <FileText
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--mist-dark)]"
        aria-hidden="true"
      />
      <select
        id="note-type"
        value={value}
        onChange={(e) => onChange(e.target.value as DocumentType)}
        className={cn(
          // An explicit background (not `transparent` like the text inputs
          // above): browsers paint the native option list with the select's
          // own background, and a transparent one renders unreadable in
          // dark mode.
          "w-full appearance-none rounded-ordilo-sm border border-border bg-card",
          "py-2 pl-9 pr-9 text-sm text-foreground",
          "focus:border-[var(--petrol)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
        data-testid="note-type-select"
      >
        {DOCUMENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {DOCUMENT_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
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
  collectionName,
  onSubmit,
}: CreateNoteSheetProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("other");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  // Only "Zugangsdaten" notes carry a password. On every other type the
  // field is meaningless noise under the editor, so it stays hidden.
  const showSecretField = documentType === "credentials";
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
    setSecret("");
    setShowSecret(false);
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

  const handleTypeChange = useCallback((type: DocumentType) => {
    setDocumentType(type);
    // Leaving "Zugangsdaten" hides the field — drop whatever was typed into
    // it so a password the user can no longer see never reaches the server.
    if (type !== "credentials") {
      setSecret("");
      setShowSecret(false);
    }
  }, []);

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
        // Secrets are opaque credentials. Whitespace decides only whether
        // the optional field is empty; meaningful leading/trailing bytes
        // must reach the encrypted server-side storage unchanged.
        secret,
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
  }, [title, content, documentType, secret, imageFile, onSubmit, reset, onOpenChange]);

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
            {/* Collection hint — shown when the note is filed into a collection */}
            {collectionName && (
              <div
                className="flex items-center gap-1.5 rounded-ordilo-sm bg-[var(--petrol)]/10 px-3 py-2 text-xs font-medium text-[var(--petrol)]"
                data-testid="note-collection-hint"
              >
                <Folder className="size-3.5 shrink-0" aria-hidden="true" />
                Wird in „{collectionName}“ abgelegt
              </div>
            )}

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
              <Label htmlFor="note-type">Typ</Label>
              <DocumentTypeSelector value={documentType} onChange={handleTypeChange} />
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

            {/* Hidden secret (e.g. password) — encrypted server-side, never
                stored in plain text. Only shown for "Zugangsdaten" notes. */}
            {showSecretField && (
              <div className="space-y-1.5" data-testid="note-secret-field">
                <Label htmlFor="note-secret" className="flex items-center gap-1.5">
                  <Lock className="size-3.5 text-[var(--mist-dark)]" aria-hidden="true" />
                  Passwort / Zugangscode
                </Label>
                <div className="relative">
                  <input
                    id="note-secret"
                    type={showSecret ? "text" : "password"}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="z. B. Passwort, PIN, Zugangscode"
                    autoComplete="off"
                    className="w-full rounded-ordilo-sm border border-border bg-transparent px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--petrol)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    data-testid="note-secret-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-ordilo-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-label={showSecret ? "Geheim verbergen" : "Geheim anzeigen"}
                  >
                    {showSecret ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Wird verschlüsselt gespeichert und ist nur per Klick sichtbar.
                </p>
              </div>
            )}

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
              // The label used to promise "& analysieren" because the save
              // waited for the analysis. It no longer does — the note is
              // stored, the sheet closes, enrichment follows in the
              // background — so the button says what it now actually does.
              "Anlegen"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
