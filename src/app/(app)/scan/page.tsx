"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  FileUp,
  UploadCloud,
  Loader2,
  AlertCircle,
  RefreshCw,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import {
  validateFile,
  isImageMimeType,
  isPdfMimeType,
  ACCEPTED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_LABEL,
} from "@/lib/schemas/document";
import type { Database } from "@/types/database";
import { DocumentCard } from "@/components/ordilo/document-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

/**
 * Tracks an in-flight upload with its progress state.
 */
interface UploadState {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Scan page — document capture and upload.
 *
 * Features:
 * - Camera photo capture (input capture="environment") — mobile
 * - PDF upload via file picker
 * - Drag-and-drop zone on desktop with visual feedback
 * - Upload progress UI (percentage bar)
 * - Processing state animation when transitioning to OCR
 * - Document list/grid with status badges (German labels)
 * - Empty state when no documents
 * - German error handling for unsupported types, oversized files, upload failures
 * - Retry on upload failure
 * - RLS-enforced (family-scoped via Supabase client)
 */
export default function ScanPage() {
  const supabase = createClient();

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Refs for file inputs (to reset them after selection).
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // --- Fetch family ID ---
  useEffect(() => {
    async function loadFamily() {
      const { data, error } = await supabase
        .from("families")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        // No family — the middleware should have redirected to onboarding,
        // but handle defensively.
        setFamilyId(null);
        return;
      }
      setFamilyId(data.id);
    }
    loadFamily();
  }, [supabase]);

  // --- Fetch documents ---
  const fetchDocuments = useCallback(async () => {
    if (!familyId) return;

    setLoadingDocs(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDocuments(data);
    }
    setLoadingDocs(false);
  }, [supabase, familyId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // --- Upload handler ---
  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!familyId) return;

      // Client-side validation (German errors).
      const validation = validateFile(file.type, file.size);
      if (!validation.valid) {
        // Show error as a transient upload entry.
        const uploadId = crypto.randomUUID();
        setUploads((prev) => [
          ...prev,
          {
            id: uploadId,
            file,
            progress: 0,
            phase: "error",
            error: validation.error,
          },
        ]);
        return;
      }

      const uploadId = crypto.randomUUID();

      // Add uploading state.
      setUploads((prev) => [
        ...prev,
        {
          id: uploadId,
          file,
          progress: 0,
          phase: "uploading",
        },
      ]);

      try {
        const result = await uploadFile(file, familyId, (percent) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, progress: percent } : u,
            ),
          );
        });

        // Transition to "processing" state briefly (transitioning to OCR).
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, phase: "processing", progress: 100 } : u,
          ),
        );

        // Refetch documents to show the new one.
        await fetchDocuments();

        // Remove the upload entry after a brief delay (let user see the
        // processing transition).
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.id !== uploadId));
        }, 1200);

        // Silence unused variable — result.document_id is available if needed.
        void result;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Upload fehlgeschlagen. Bitte erneut versuchen.";
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, phase: "error", error: message } : u,
          ),
        );
      }
    },
    [familyId, fetchDocuments],
  );

  // --- Retry upload ---
  const handleRetry = useCallback(
    (uploadId: string) => {
      const upload = uploads.find((u) => u.id === uploadId);
      if (!upload) return;

      // Remove the failed upload entry.
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      // Re-trigger the upload.
      handleFileUpload(upload.file);
    },
    [uploads, handleFileUpload],
  );

  // --- File input handlers ---
  const handleCameraSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    // Reset input so the same file can be selected again.
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  // --- Drag and drop handlers ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types?.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types?.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragOver to false when leaving the drop zone itself
    // (not when entering a child element).
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      handleFileUpload(file);
    }
  };

  // --- Render ---
  const hasDocuments = documents.length > 0;
  const hasActiveUploads = uploads.length > 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dokument scannen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Foto aufnehmen oder PDF hochladen — Ordilo erledigt den Rest.
        </p>
      </div>

      {/* Capture zone */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-ordilo-lg border-2 border-dashed p-6 transition-colors",
          isDragOver
            ? "border-[var(--petrol)] bg-[var(--blue-soft)]"
            : "border-border bg-card",
        )}
      >
        {/* Drag-and-drop hint (desktop) */}
        {isDragOver ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <UploadCloud
              className="size-12 text-[var(--petrol)]"
              strokeWidth={1.5}
            />
            <p className="mt-3 font-medium text-[var(--petrol)]">
              Datei hier ablegen
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Upload cloud icon */}
            <div
              className="flex size-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--secondary)" }}
            >
              <ScanLine
                className="size-8"
                style={{ color: "var(--petrol)" }}
                strokeWidth={1.5}
              />
            </div>

            {/* Action buttons */}
            <div className="flex w-full flex-col gap-3 sm:flex-row">
              <CaptureButton
                icon={Camera}
                label="Foto aufnehmen"
                description="Kamera verwenden"
                onClick={() => cameraInputRef.current?.click()}
              />
              <CaptureButton
                icon={FileUp}
                label="PDF hochladen"
                description="Datei auswählen"
                onClick={() => pdfInputRef.current?.click()}
              />
            </div>

            {/* Desktop drag hint */}
            <p className="text-center text-xs text-muted-foreground">
              oder Datei hierher ziehen und ablegen
            </p>

            {/* Format hint */}
            <p className="text-center text-xs text-muted-foreground">
              Bilder (JPG, PNG, WebP) und PDF · max. {MAX_FILE_SIZE_LABEL}
            </p>
          </div>
        )}
      </div>

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
              onDismiss={() =>
                setUploads((prev) => prev.filter((u) => u.id !== upload.id))
              }
            />
          ))}
        </div>
      )}

      {/* Document list / empty state */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Dokumente
        </h2>

        {loadingDocs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasDocuments ? (
          <div className="space-y-3" data-testid="document-list">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                originalFilename={doc.original_filename}
                mimeType={doc.mime_type}
                status={doc.status}
                createdAt={doc.created_at}
                errorMessage={doc.error_message}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Noch keine Dokumente"
            description="Scanne dein erstes Dokument — Ordilo hilft dir beim Sortieren und Finden."
            icon={ScanLine}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * CaptureButton — a button that offers a capture/upload affordance.
 * Shows an icon, a label, and a small description.
 */
function CaptureButton({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center gap-3 rounded-ordilo-md border border-border bg-background p-4 text-left transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-ordilo-sm"
        style={{ backgroundColor: "var(--petrol)" }}
      >
        <Icon className="size-5 text-white" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

/**
 * UploadProgressCard — shows upload progress, processing animation, or error.
 */
function UploadProgressCard({
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
            Wird verarbeitet …
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
            aria-label="Upload wiederholen"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Wiederholen
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center justify-center rounded-ordilo-sm px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Fehler verwerfen"
          >
            Verwerfen
          </button>
        </div>
      )}
    </div>
  );
}
