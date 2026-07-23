"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, FileText, Loader2, RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import type { SourceLocation } from "@/lib/source-locations";

interface SignedFileResponse {
  url: string;
  mimeType?: string | null;
}

function isImageFile(file: SignedFileResponse): boolean {
  if (file.mimeType) return file.mimeType.startsWith("image/");
  try {
    return /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(
      new URL(file.url).pathname,
    );
  } catch {
    return false;
  }
}

export function OriginalDocumentPreview({
  documentId,
  title,
  open,
  onOpenChange,
  sourceText,
}: {
  documentId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Raw field value used to locate one OCR block in the original. */
  sourceText?: string | null;
}) {
  const [desktop, setDesktop] = useState(false);
  const [file, setFile] = useState<SignedFileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);

  useMountEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  });

  const loadOriginal = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setFile(null);
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/documents/${documentId}/file`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as SignedFileResponse;
      if (!result.url) throw new Error();
      setFile(result);
    } catch {
      if (!controller.signal.aborted) {
        setError("Das Original konnte gerade nicht geladen werden.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [documentId]);

  useMountEffect(() => {
    void loadOriginal();
    return () => requestController.current?.abort();
  });

  const content = (
    <DocumentFrame
      file={file}
      loading={loading}
      error={error}
      title={title}
      documentId={documentId}
      sourceText={sourceText}
      onRetry={() => void loadOriginal()}
    />
  );

  // Desktop: render as an aside beside the review content.
  if (desktop && open) {
    return (
      <aside
        className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col overflow-hidden rounded-ordilo-md border border-border bg-[var(--sand-light)]"
        aria-label="Originaldokument"
        data-testid="original-document-preview-desktop"
      >
        <PreviewHeader title={title} onClose={() => onOpenChange(false)} />
        {content}
      </aside>
    );
  }

  // Mobile: images get an inline panel that shares the review's scroll
  // container (true side-by-side with the recognized fields). PDFs need
  // the full screen to be legible, so they open in a fullscreen dialog
  // once we know the file is a PDF. While the signed URL is still
  // loading we render the inline panel (spinner) — for a PDF it swaps to
  // fullscreen as soon as the type is known.
  const isImage = file ? isImageFile(file) : true;

  if (!desktop && open && !isImage) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 z-[70] flex h-dvh max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-[var(--warm-white)] p-0"
          data-testid="original-document-preview-mobile"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Originaldokument</DialogTitle>
            <DialogDescription>
              Vergleiche die erkannten Angaben mit dem Originaldokument.
            </DialogDescription>
          </DialogHeader>
          <PreviewHeader title={title} onClose={() => onOpenChange(false)} mobile />
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  if (!desktop && open) {
    return <InlineMobilePreview title={title} onClose={() => onOpenChange(false)} content={content} />;
  }

  // Closed: render nothing, but the mount effects above already fetched
  // the signed URL so opening is instant when the user taps "vergleichen".
  return null;
}

/**
 * Mobile inline preview for images — sits above the recognized fields in
 * the review's scroll container and scrolls itself into view on mount so
 * the user actually sees the comparison instead of staring at the fields
 * they were already reading.
 */
function InlineMobilePreview({
  title,
  onClose,
  content,
}: {
  title: string;
  onClose: () => void;
  content: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    // Defer one frame so the panel has its height before scrolling.
    const id = requestAnimationFrame(() => {
      ref.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  });

  return (
    <div
      ref={ref}
      className="flex h-[min(56dvh,30rem)] min-h-[18rem] flex-col overflow-hidden rounded-ordilo-md border border-border bg-[var(--sand-light)]"
      aria-label="Originaldokument"
      data-testid="original-document-preview-mobile"
    >
      <PreviewHeader title={title} onClose={onClose} mobile />
      {content}
    </div>
  );
}

function PreviewHeader({
  title,
  onClose,
  mobile = false,
}: {
  title: string;
  onClose: () => void;
  mobile?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-border bg-[var(--sand)] px-4 py-3"
      style={
        mobile
          ? { paddingTop: "max(0.75rem, env(safe-area-inset-top))" }
          : undefined
      }
    >
      <button
        type="button"
        onClick={onClose}
        className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={mobile ? "Zurück zu den Angaben" : "Original schließen"}
        data-testid="original-document-preview-close"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </button>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Original</p>
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
      </div>
    </div>
  );
}

function DocumentFrame({
  file,
  loading,
  error,
  title,
  documentId,
  sourceText,
  onRetry,
}: {
  file: SignedFileResponse | null;
  loading: boolean;
  error: string | null;
  title: string;
  documentId: string;
  sourceText?: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="size-5 animate-spin text-[var(--petrol)]" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Original wird geöffnet …</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div
          className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          aria-hidden="true"
        >
          <FileText className="size-5" />
        </div>
        <p className="max-w-xs text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-ordilo-sm px-3 py-2 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Nochmal versuchen
        </button>
      </div>
    );
  }

  if (!file) return null;

  const isImage = isImageFile(file);

  return (
    <div
      className={cn(
        "min-h-0 flex-1 bg-[var(--sand-light)]",
        isImage && "overflow-auto p-4",
      )}
    >
      {isImage ? (
        <div className="relative mx-auto w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt={`Original von ${title}`}
            className="block h-auto w-full rounded-ordilo-sm bg-[var(--warm-white)] shadow-card"
          />
          {sourceText && (
            <SourceHighlight
              key={sourceText}
              documentId={documentId}
              sourceText={sourceText}
            />
          )}
        </div>
      ) : (
        <iframe
          src={file.url}
          title={`Original von ${title}`}
          className="size-full border-0 bg-[var(--warm-white)]"
        />
      )}
    </div>
  );
}

function SourceHighlight({
  documentId,
  sourceText,
}: {
  documentId: string;
  sourceText: string;
}) {
  const [location, setLocation] = useState<SourceLocation | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/documents/${documentId}/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sourceText }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as {
          location?: SourceLocation | null;
        };
        if (!controller.signal.aborted) {
          setLocation(result.location ?? null);
          requestAnimationFrame(() => {
            highlightRef.current?.scrollIntoView?.({
              block: "center",
              behavior: "smooth",
            });
          });
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  });

  if (!location) return null;

  return (
    <div
      ref={highlightRef}
      className="pointer-events-none absolute rounded-sm border-2 border-[var(--apricot)] bg-[var(--apricot)]/15"
      style={{
        left: `${location.bounds.left * 100}%`,
        top: `${location.bounds.top * 100}%`,
        width: `${location.bounds.width * 100}%`,
        height: `${location.bounds.height * 100}%`,
      }}
      aria-label="Passage im Original"
      role="img"
    />
  );
}
