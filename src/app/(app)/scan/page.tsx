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
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import { triggerOcr } from "@/lib/ocr";
import {
  validateFile,
  isImageMimeType,
  isPdfMimeType,
  isProcessingStatus,
  getFailedStage,
  ACCEPTED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_LABEL,
} from "@/lib/schemas/document";
import type { Database } from "@/types/database";
import { DocumentCard } from "@/components/ordilo/document-card";
import { EmptyState } from "@/components/ordilo/empty-state";
import { ReviewCard } from "@/components/ordilo/review-card";
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
  // Track which document is expanded to show the Review Card.
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  // Track documents for which analysis has been auto-triggered (to avoid
  // duplicate calls when the polling effect re-runs).
  const triggeredAnalysisRef = useRef<Set<string>>(new Set());
  // One-time guard: on the initial fetchDocuments load, we seed
  // triggeredAnalysisRef with the IDs of all documents already in
  // 'ocr_done' so the auto-analyze effect does NOT fire for pre-existing
  // documents (e.g. a stuck/OCR-less doc reached via source-card
  // navigation from /suche). Only documents that transition to
  // 'ocr_done' DURING this session (freshly uploaded) auto-analyze.
  const seededPreExistingRef = useRef(false);

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
      // On the initial load, seed triggeredAnalysisRef with the IDs of
      // all documents already in 'ocr_done' BEFORE updating state, so the
      // auto-analyze effect sees them as already triggered and does not
      // fire POST /analyze for pre-existing documents. This prevents the
      // 400 NO_OCR_TEXT error (and the resulting console error) when
      // navigating to /scan from a source card on /suche. Only documents
      // that reach 'ocr_done' later (after an in-session upload) will
      // auto-analyze.
      if (!seededPreExistingRef.current) {
        for (const doc of data) {
          if (doc.status === "ocr_done") {
            triggeredAnalysisRef.current.add(doc.id);
          }
        }
        seededPreExistingRef.current = true;
      }
      setDocuments(data);
    }
    setLoadingDocs(false);
  }, [supabase, familyId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // --- Auto-expand document from query param (e.g. /scan?doc=ID) ---
  // When the user navigates from the search page by clicking a source card,
  // the URL contains ?doc=ID. We auto-expand that document's review card
  // so the user sees the referenced document immediately (VAL-SEARCH-027).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const docId = params.get("doc");
    if (docId) {
      setExpandedDocId(docId);
    }
  }, []);

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

        // Transition to "processing" state (transitioning to OCR).
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, phase: "processing", progress: 100 } : u,
          ),
        );

        // Refetch documents to show the new one (status: uploaded).
        await fetchDocuments();

        // Remove the upload entry after a brief delay (let user see the
        // processing transition).
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.id !== uploadId));
        }, 1200);

        // Auto-trigger OCR for the newly uploaded document.
        // This is a fire-and-forget call — the route sets status to
        // ocr_processing immediately, then polls Datalab server-side.
        // The UI reflects the processing state via the document list
        // polling below.
        triggerOcr(result.document_id).catch(() => {
          // OCR failure is handled by the document list polling — the
          // route sets the document status to "failed" with an error
          // message, which the DocumentCard displays with a retry button.
          // Refetch to surface the failed status immediately.
          fetchDocuments();
        });

        // Refetch shortly after to pick up the ocr_processing status
        // (the OCR route sets it before the Datalab call).
        setTimeout(() => fetchDocuments(), 1500);
      } catch (err) {
        // Upload failure (Storage write or network) — shown on the upload
        // card, NOT on a document card (no documents row is created).
        // This distinguishes upload failures from OCR failures.
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

  // --- OCR status polling ---
  // While any document is in a processing state (ocr_processing or
  // analyzing), poll the document list every 3 seconds to update the UI.
  // This keeps the document cards in sync with server-side processing
  // without requiring a page reload. Stops when no documents are processing.
  const hasProcessingDocs = documents.some((d) => isProcessingStatus(d.status));

  useEffect(() => {
    if (!hasProcessingDocs || !familyId) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [hasProcessingDocs, familyId, fetchDocuments]);

  // --- Retry a failed document (routed by failing pipeline stage) ---
  // The generic `failed` status covers both OCR-stage and analysis-stage
  // failures (see AGENTS.md). To retry correctly, we derive the failing
  // stage from the persisted document state: a document that never
  // produced OCR text failed at the OCR stage (retry via OCR endpoint);
  // a document with OCR text present failed at the analysis stage
  // (retry via the analyze endpoint). This prevents misrouting an
  // OCR-stage failure through the analyze endpoint (which would reject
  // it with NO_OCR_TEXT) and vice versa.
  const handleRetryFailed = useCallback(
    async (documentId: string) => {
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) return;

      const stage = getFailedStage(doc);

      if (stage === "ocr") {
        // OCR-stage failure → retry via the OCR endpoint.
        // Optimistically update the document status to ocr_processing
        // so the UI shows the processing animation immediately.
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === documentId
              ? { ...d, status: "ocr_processing", error_message: null }
              : d,
          ),
        );

        try {
          await triggerOcr(documentId);
        } catch {
          // OCR failed again — refetch to get the failed status + error.
        }
        await fetchDocuments();
        return;
      }

      // Analysis-stage failure → retry via the analyze endpoint.
      // Optimistically update the document status to analyzing so the
      // UI shows the processing animation immediately.
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === documentId
            ? { ...d, status: "analyzing", error_message: null }
            : d,
        ),
        );

      try {
        const response = await fetch(
          `/api/documents/${documentId}/analyze`,
          { method: "POST" },
        );
        if (!response.ok) {
          // Analysis failed again — refetch to get the failed status.
        }
      } catch {
        // Network error — refetch to get the current status.
      }
      await fetchDocuments();
    },
    [documents, fetchDocuments],
  );

  // --- Trigger analysis for a document ---
  const triggerAnalysis = useCallback(
    async (documentId: string) => {
      try {
        const response = await fetch(
          `/api/documents/${documentId}/analyze`,
          { method: "POST" },
        );
        if (response.ok) {
          // Analysis succeeded — refetch to get the analyzed state.
          await fetchDocuments();
        } else {
          // Analysis failed — refetch to get the failed status.
          await fetchDocuments();
        }
      } catch {
        // Network error — refetch to get the current status.
        await fetchDocuments();
      }
    },
    [fetchDocuments],
  );

  // --- Auto-trigger analysis when a document reaches ocr_done ---
  // When OCR completes, automatically start the LLM analysis so the
  // user sees the Review Card without an extra manual step.
  useEffect(() => {
    for (const doc of documents) {
      if (
        doc.status === "ocr_done" &&
        !triggeredAnalysisRef.current.has(doc.id)
      ) {
        triggeredAnalysisRef.current.add(doc.id);
        // Optimistically update status to analyzing.
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, status: "analyzing", error_message: null }
              : d,
          ),
        );
        triggerAnalysis(doc.id);
      }
    }
  }, [documents, triggerAnalysis]);

  // --- Handle confirm/re-analyze success from Review Card ---
  const handleConfirmSuccess = useCallback(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleReanalyzeSuccess = useCallback(() => {
    fetchDocuments();
  }, [fetchDocuments]);

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
            {documents.map((doc) => {
              // Documents in these statuses can show a Review Card
              // when expanded.
              const canShowReview = [
                "analyzed",
                "analyzing",
                "failed",
                "confirmed",
              ].includes(doc.status);
              const isExpanded = expandedDocId === doc.id;

              return (
                <div key={doc.id} className="space-y-2">
                  <div className="relative">
                    <DocumentCard
                      title={doc.title}
                      originalFilename={doc.original_filename}
                      mimeType={doc.mime_type}
                      status={doc.status}
                      createdAt={doc.created_at}
                      errorMessage={doc.error_message}
                      onClick={
                        canShowReview
                          ? () =>
                              setExpandedDocId((prev) =>
                                prev === doc.id ? null : doc.id,
                              )
                          : undefined
                      }
                      onRetry={
                        doc.status === "failed"
                          ? () => handleRetryFailed(doc.id)
                          : undefined
                      }
                    />
                    {/* Expand/collapse indicator for reviewable documents */}
                    {canShowReview && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDocId((prev) =>
                            prev === doc.id ? null : doc.id,
                          )
                        }
                        className="absolute top-1/2 right-16 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        aria-label={
                          isExpanded
                            ? "Review schließen"
                            : "Review öffnen"
                        }
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                  {/* Review Card (shown when expanded) */}
                  {canShowReview && isExpanded && (
                    <ReviewCard
                      documentId={doc.id}
                      status={doc.status}
                      errorMessage={doc.error_message}
                      onConfirmSuccess={handleConfirmSuccess}
                      onReanalyzeSuccess={handleReanalyzeSuccess}
                      onRetry={() => handleRetryFailed(doc.id)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Noch keine Dokumente"
            description="Scanne dein erstes Dokument — Ordilo hilft dir beim Sortieren und Finden."
            icon={ScanLine}
            actionLabel="Dokument hochladen"
            onAction={() => cameraInputRef.current?.click()}
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
