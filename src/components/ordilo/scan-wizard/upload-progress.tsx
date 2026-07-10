import {
  Camera,
  FileUp,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  isImageMimeType,
  isPdfMimeType,
} from "@/lib/schemas/document";
import { cn } from "@/lib/utils";

/**
 * Tracks an in-flight upload with its progress state.
 */
export interface UploadState {
  /** Unique ID for this upload attempt (not the document ID). */
  id: string;
  /** The file being uploaded. */
  file: File;
  /** Upload progress percentage (0-100). */
  progress: number;
  /** Current upload phase. */
  phase: "uploading" | "processing" | "error";
  /** German error message when phase is "error". */
  error?: string;
}

/**
 * UploadProgressCard — shows upload progress, processing animation, or error.
 */
export function UploadProgressCard({
  upload,
  onRetry,
  onDismiss,
}: {
  upload: UploadState;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isUploading = upload.phase === "uploading";
  const isProcessing = upload.phase === "processing";
  const isError = upload.phase === "error";

  // Determine the file icon.
  const FileIcon = isImageMimeType(upload.file.type)
    ? Camera
    : isPdfMimeType(upload.file.type)
      ? FileUp
      : FileUp;

  return (
    <div
      data-testid={`upload-card-${upload.id}`}
      className={cn(
        "flex items-center gap-3 rounded-ordilo-md border p-4 shadow-card",
        isError
          ? "border-destructive/20 bg-destructive/5"
          : "border-border bg-card",
      )}
    >
      {/* File icon / spinner */}
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-ordilo-sm"
        style={{ backgroundColor: "var(--secondary)" }}
      >
        {isUploading || isProcessing ? (
          <Loader2
            className="size-6 animate-spin"
            style={{ color: "var(--petrol)" }}
          />
        ) : isError ? (
          <AlertCircle
            className="size-6 text-destructive"
            strokeWidth={1.5}
          />
        ) : (
          <FileIcon
            className="size-6"
            style={{ color: "var(--mist-dark)" }}
            strokeWidth={1.5}
          />
        )}
      </div>

      {/* Content: filename + progress bar OR error message */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{upload.file.name}</p>

        {isUploading && (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--mist-light)]">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${upload.progress}%`,
                  backgroundColor: "var(--petrol)",
                }}
                data-testid="progress-bar"
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Wird hochgeladen … {upload.progress}%
            </p>
          </>
        )}

        {isProcessing && (
          <p className="mt-1 text-sm text-[var(--petrol)]">
            Wird gelesen …
          </p>
        )}

        {isError && (
          <p className="mt-1 truncate text-sm text-destructive">
            {upload.error}
          </p>
        )}
      </div>

      {/* Retry / dismiss actions */}
      {isError && (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-ordilo-sm px-2.5 py-1.5 text-xs font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Nochmal versuchen"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Nochmal versuchen
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center justify-center rounded-ordilo-sm px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Schließen"
          >
            Schließen
          </button>
        </div>
      )}
    </div>
  );
}
