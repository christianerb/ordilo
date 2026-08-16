"use client";

import { useState } from "react";
import { FileText, Lock, Eye, EyeOff, Loader2, Copy, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ReviewCard } from "@/components/ordilo/review-card";
import { DocumentAttribution } from "@/components/ordilo/document-attribution";
import {
  getFileIcon,
  getStatusBadgeClasses,
  getStatusLabel,
} from "@/lib/schemas/document";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { useSecretReveal } from "@/lib/hooks/use-secret-reveal";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DocRow = Database["public"]["Tables"]["documents"]["Row"];

// ---------------------------------------------------------------------------
// Secret reveal — click-to-reveal for a document's hidden value.
// The ciphertext lives in documents.secret; only this POST endpoint
// returns the decrypted plaintext. The value is never shown by default
// and is re-hidden when the sheet closes.
// ---------------------------------------------------------------------------

function SecretReveal({ documentId }: { documentId: string }) {
  const { revealed, show, loading, copied, error, reveal, toggleShow, copy } =
    useSecretReveal(documentId);

  return (
    <div
      className="mx-5 mt-4 rounded-ordilo-sm border border-border bg-[var(--sand-light)]/60 px-3 py-2.5"
      data-testid="document-secret-reveal"
    >
      <div className="flex items-center gap-2">
        <Lock className="size-3.5 shrink-0 text-[var(--mist-dark)]" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">Passwort / Geheim</span>
        <div className="ml-auto flex items-center gap-1">
          {revealed != null && (
            <>
              <button
                type="button"
                onClick={toggleShow}
                className="rounded-ordilo-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label={show ? "Geheim verbergen" : "Geheim anzeigen"}
              >
                {show ? (
                  <EyeOff className="size-3.5" aria-hidden="true" />
                ) : (
                  <Eye className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={copy}
                className="rounded-ordilo-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Geheim kopieren"
              >
                {copied ? (
                  <Check className="size-3.5 text-[var(--petrol)]" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reveal}
            disabled={loading}
            className="h-7 px-2.5 text-xs"
            data-testid="secret-reveal-button"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : revealed == null ? (
              "Anzeigen"
            ) : (
              "Neu laden"
            )}
          </Button>
        </div>
      </div>
      {revealed != null && show && (
        <p
          className="mt-2 break-all rounded-ordilo-sm bg-card px-2.5 py-1.5 font-mono text-sm text-foreground"
          data-testid="secret-revealed-value"
        >
          {revealed}
        </p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-destructive" data-testid="secret-error">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Secret editor — set, change or remove the hidden value.
// A secret used to be settable only while creating a note, so a mistyped
// password could never be corrected and a document created without one
// (the chat never carries a password) could never get one.
// ---------------------------------------------------------------------------

function SecretEditor({
  documentId,
  hasSecret,
  onSaved,
  onCancel,
}: {
  documentId: string;
  hasSecret: boolean;
  onSaved: (hasSecret: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/secret`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: value }),
      });
      const body = (await res.json()) as { has_secret?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Passwort konnte nicht gespeichert werden.");
      }
      onSaved(Boolean(body.has_secret));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Passwort konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="mx-5 mt-4 rounded-ordilo-sm border border-border bg-[var(--sand-light)]/60 px-3 py-2.5"
      data-testid="document-secret-editor"
    >
      <div className="flex items-center gap-2">
        <Lock className="size-3.5 shrink-0 text-[var(--mist-dark)]" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">
          {hasSecret ? "Passwort ändern" : "Passwort hinterlegen"}
        </span>
      </div>
      <div className="relative mt-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="z. B. Passwort, PIN, Zugangscode"
          autoComplete="off"
          className="w-full rounded-ordilo-sm border border-border bg-card px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-[var(--petrol)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="secret-editor-input"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-ordilo-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
        >
          {show ? (
            <EyeOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Eye className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving}
          className="h-7 px-2.5 text-xs"
          data-testid="secret-editor-save"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : hasSecret && !value.trim() ? (
            "Passwort entfernen"
          ) : (
            "Speichern"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="h-7 px-2.5 text-xs"
        >
          Abbrechen
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Wird verschlüsselt gespeichert und ist nur per Klick sichtbar.
      </p>
      {error && (
        <p className="mt-1.5 text-xs text-destructive" data-testid="secret-editor-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The password area of the detail sheet: reveals an existing secret and
 * offers to set, change or remove one.
 *
 * A document without a secret only gets the offer when it is a
 * "Zugangsdaten" document — for every other type an empty password field
 * would be noise, the same reasoning the note form follows.
 */
function SecretSection({
  documentId,
  documentType,
  initialHasSecret,
}: {
  documentId: string;
  documentType: string | null;
  initialHasSecret: boolean;
}) {
  const [hasSecret, setHasSecret] = useState(initialHasSecret);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SecretEditor
        documentId={documentId}
        hasSecret={hasSecret}
        onSaved={(next) => {
          setHasSecret(next);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (hasSecret) {
    return (
      <>
        {/* Remounted on change so a previously revealed value is dropped
            rather than kept next to a password that no longer matches. */}
        <SecretReveal key={String(hasSecret)} documentId={documentId} />
        <div className="mx-5 mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-ordilo-sm px-1.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="secret-change-button"
          >
            Passwort ändern
          </button>
        </div>
      </>
    );
  }

  if (documentType !== "credentials") return null;

  return (
    <div className="mx-5 mt-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEditing(true)}
        className="h-8 text-xs"
        data-testid="secret-add-button"
      >
        <Lock className="size-3.5" aria-hidden="true" />
        Passwort hinterlegen
      </Button>
    </div>
  );
}

/**
 * Document Detail Sheet — a right-side slide-in panel that shows the full
 * `ReviewCard` for a single document, regardless of its pipeline status.
 *
 * Used by the documents table (and any other entry point that wants a
 * non-inline detail view) so clicking a row opens the same rich analysis,
 * metadata, and actions as the inline review flow, without needing to
 * navigate away or expand a card in place.
 */
export function DocumentDetailSheet({
  document,
  open,
  onOpenChange,
  onConfirmSuccess,
  onReanalyzeSuccess,
  onRetry,
}: {
  document: DocRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSuccess?: () => void;
  onReanalyzeSuccess?: () => void;
  onRetry?: (documentId: string) => void;
}) {
  const FileIcon = document ? getFileIcon(document.mime_type) : FileText;
  const displayTitle =
    document?.title?.trim() || document?.original_filename || "Dokument";
  const [desktop, setDesktop] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);

  useMountEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  });

  const closeSheet = () => {
    setDirty(false);
    setComparisonOpen(false);
    setDiscardPromptOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
            return;
          }
          if (dirty) {
            setDiscardPromptOpen(true);
            return;
          }
          closeSheet();
        }}
      >
      <SheetContent
        side={desktop ? "right" : "bottom"}
        className={cn(
          "w-full gap-0 p-0",
          desktop
            ? comparisonOpen
              ? "lg:max-w-[min(92vw,80rem)]"
              : "lg:max-w-xl xl:max-w-[42rem]"
            : "max-h-[90dvh] rounded-t-ordilo-xl",
        )}
        data-testid="document-detail-sheet"
      >
        <SheetHeader className="border-b border-border bg-[var(--sand)]/70 px-5 py-4">
          <SheetTitle className="flex flex-col items-start gap-2 pr-12">
            <span className="flex min-w-0 items-start gap-2 text-[15px]">
              <FileIcon
                className="mt-0.5 size-4 shrink-0 text-[var(--mist-dark)]"
                aria-hidden="true"
              />
              <span className="line-clamp-2 text-left leading-snug">
                {displayTitle}
              </span>
            </span>
            {document && (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                    getStatusBadgeClasses(document.status),
                  )}
                >
                  {getStatusLabel(document.status)}
                </span>
                <DocumentAttribution
                  uploadedBy={document.uploaded_by}
                  createdAt={document.created_at}
                />
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Details und Metadaten für dieses Dokument
          </SheetDescription>
        </SheetHeader>

        {document && (
          <SecretSection
            key={document.id}
            documentId={document.id}
            documentType={document.document_type}
            initialHasSecret={Boolean(document.secret)}
          />
        )}
        {document && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <ReviewCard
              key={`${document.id}:${document.status}`}
              documentId={document.id}
              status={document.status}
              errorMessage={document.error_message}
              failureStage={document.failure_stage}
              failureCode={document.failure_code}
              onConfirmSuccess={onConfirmSuccess}
              onReanalyzeSuccess={onReanalyzeSuccess}
              onRetry={onRetry ? () => onRetry(document.id) : undefined}
              onOriginalPreviewChange={setComparisonOpen}
              onDirtyChange={setDirty}
              hasOriginalFile={Boolean(document.file_url)}
            />
          </div>
        )}
      </SheetContent>
      </Sheet>

      <Dialog open={discardPromptOpen} onOpenChange={setDiscardPromptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Änderungen verwerfen?</DialogTitle>
            <DialogDescription>
              Deine Korrekturen wurden noch nicht übernommen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDiscardPromptOpen(false)}
            >
              Weiter bearbeiten
            </Button>
            <Button type="button" variant="destructive" onClick={closeSheet}>
              Verwerfen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
