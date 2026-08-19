"use client";

import { useState, useRef, useCallback } from "react";
import {
  Camera,
  ChevronDown,
  Folder,
  Images,
  Link2,
  Loader2,
  FileText,
  Eye,
  EyeOff,
  Lock,
  User,
} from "lucide-react";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerFooter,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NoteEditor } from "@/components/ordilo/note-editor";
import { buildCredentialsContent } from "@/lib/credentials";
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
    /**
     * Markdown body. For "Zugangsdaten" notes this is the composed body —
     * URL and user name followed by the description — never the password.
     */
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

/** Shared look of every single-line text field in this sheet. */
const FIELD_CLASS =
  "w-full rounded-ordilo-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--petrol)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Create Note Sheet — a bottom/right slide-in panel for manually creating
 * a document with a title, markdown text body, document type selection,
 * and an optional image attachment.
 *
 * Picking the type "Zugangsdaten" turns the form into a login form: URL,
 * user name and password fields appear, and the text body below becomes
 * the description of that login. URL and user name are folded into the
 * markdown body (see `buildCredentialsContent`) so the document stays a
 * plain note downstream; only the password takes the separate, encrypted
 * `secret` path.
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
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  // "Zugangsdaten" is the one type with its own shape: a login has a URL, a
  // user name and a password, and the free text below is a description of
  // it. Every other type is a plain note, where those fields — the password
  // above all — would be meaningless noise.
  const isCredentials = documentType === "credentials";
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
    setUrl("");
    setUsername("");
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
    // Leaving "Zugangsdaten" hides the login fields — drop what was typed
    // into them so values the user can no longer see, the password above
    // all, never reach the server. The description survives: it is the same
    // free text every other type writes.
    if (type !== "credentials") {
      setSecret("");
      setShowSecret(false);
      setUrl("");
      setUsername("");
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
    const trimmedUrl = url.trim();
    const trimmedUsername = username.trim();

    if (!trimmedTitle) {
      setError(
        isCredentials ? "Bitte gib einen Namen ein." : "Bitte gib einen Titel ein.",
      );
      return;
    }
    if (isCredentials) {
      // A login needs at least one thing worth looking up later — which of
      // the four it is, is the user's business.
      if (!trimmedUrl && !trimmedUsername && !secret && !trimmedContent) {
        setError(
          "Bitte gib mindestens URL, Benutzername, Passwort oder Beschreibung an.",
        );
        return;
      }
    } else if (!trimmedContent) {
      setError("Bitte schreib etwas in die Notiz.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: trimmedTitle,
        content: isCredentials
          ? buildCredentialsContent({
              title: trimmedTitle,
              url: trimmedUrl,
              username: trimmedUsername,
              description: trimmedContent,
            })
          : trimmedContent,
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
  }, [
    title,
    content,
    documentType,
    isCredentials,
    secret,
    url,
    username,
    imageFile,
    onSubmit,
    reset,
    onOpenChange,
  ]);

  const hasBody = isCredentials
    ? Boolean(url.trim() || username.trim() || secret || content.trim())
    : Boolean(content.trim());
  const canSubmit = Boolean(title.trim()) && hasBody && !submitting;

  return (
    <OrdiloDrawer
      variant="form"
      open={open}
      onOpenChange={handleClose}
      data-testid="create-note-sheet"
    >
      <OrdiloDrawerHeader
        title={
          <span className="flex items-center gap-2">
            <FileText
              className="size-4 shrink-0 text-[var(--mist-dark)]"
              aria-hidden="true"
            />
            Dokument anlegen
          </span>
        }
        description="Ein Dokument mit eigener Notiz anlegen"
        descriptionHidden
      />

      <OrdiloDrawerBody>
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

          {/* Title — the name of the login for credentials */}
          <div className="space-y-1.5">
            <Label htmlFor="note-title">{isCredentials ? "Name" : "Titel"}</Label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                isCredentials
                  ? "z. B. Netflix, Stadtwerke-Portal, WLAN"
                  : "z. B. Arztbesuch Notiz, Idee fur Urlaub ..."
              }
              maxLength={200}
              className={FIELD_CLASS}
              data-testid="note-title-input"
            />
          </div>

          {/* Document type */}
          <div className="space-y-1.5">
            <Label htmlFor="note-type">Typ</Label>
            <DocumentTypeSelector value={documentType} onChange={handleTypeChange} />
          </div>

          {/* Login fields — only "Zugangsdaten" notes have them. URL and
              user name become part of the note text; the password does
              not: it is stored encrypted, separately. */}
          {isCredentials && (
            <div className="space-y-4" data-testid="note-credentials-fields">
              <div className="space-y-1.5">
                <Label htmlFor="note-url" className="flex items-center gap-1.5">
                  <Link2 className="size-3.5 text-[var(--mist-dark)]" aria-hidden="true" />
                  URL
                </Label>
                <input
                  id="note-url"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="z. B. https://www.netflix.com"
                  maxLength={500}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={FIELD_CLASS}
                  data-testid="note-url-input"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="note-username" className="flex items-center gap-1.5">
                  <User className="size-3.5 text-[var(--mist-dark)]" aria-hidden="true" />
                  Benutzername
                </Label>
                <input
                  id="note-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="z. B. familie@example.de"
                  maxLength={200}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={FIELD_CLASS}
                  data-testid="note-username-input"
                />
              </div>

              <div className="space-y-1.5" data-testid="note-secret-field">
                <Label htmlFor="note-secret" className="flex items-center gap-1.5">
                  <Lock className="size-3.5 text-[var(--mist-dark)]" aria-hidden="true" />
                  Passwort
                </Label>
                <div className="relative">
                  <input
                    id="note-secret"
                    type={showSecret ? "text" : "password"}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="z. B. Passwort, PIN, Zugangscode"
                    autoComplete="off"
                    className={cn(FIELD_CLASS, "pr-10")}
                    data-testid="note-secret-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-ordilo-sm p-1 text-muted-foreground hover:text-foreground focus-ring"
                    aria-label={showSecret ? "Passwort verbergen" : "Passwort anzeigen"}
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
            </div>
          )}

          {/* Free text — the note itself, or the description of a login */}
          <div className="space-y-1.5">
            <Label>{isCredentials ? "Beschreibung" : "Notiz"}</Label>
            <NoteEditor
              value={content}
              onChange={setContent}
              imagePreview={imagePreview}
              onRemoveImage={handleRemoveImage}
              placeholder={
                isCredentials
                  ? "z. B. Familienaccount, Sicherheitsfragen, wer ihn nutzt ..."
                  : undefined
              }
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
      </OrdiloDrawerBody>

      <OrdiloDrawerFooter>
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
            // stored, the drawer closes, enrichment follows in the
            // background — so the button says what it now actually does.
            "Anlegen"
          )}
        </Button>
      </OrdiloDrawerFooter>
    </OrdiloDrawer>
  );
}
