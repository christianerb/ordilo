"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { triggerOcr } from "@/lib/ocr";
import { validateFile } from "@/lib/schemas/document";
import { uploadFile } from "@/lib/upload";
import { prepareImageForUpload } from "@/lib/image-compress";
import type { UploadState } from "@/components/ordilo/scan-wizard/upload-progress";
import type {
  FetchDocumentByIdFn,
  FetchDocumentsFn,
} from "@/lib/scan/scan-pipeline-refs";

/**
 * The background upload queue: file intake (camera, PDF picker, drag &
 * drop), progress tracking, retry, and the OCR/analysis kick-off after a
 * successful upload.
 */
export function useUploadQueue({
  ensureFamilyId,
  familyIdRef,
  fetchDocumentsRef,
  fetchDocumentByIdRef,
  documentsLoadedRef,
  triggeredAnalysisRef,
  serverPipelineRef,
}: {
  ensureFamilyId: () => Promise<string | null>;
  familyIdRef: RefObject<string | null>;
  fetchDocumentsRef: RefObject<FetchDocumentsFn>;
  fetchDocumentByIdRef: RefObject<FetchDocumentByIdFn>;
  documentsLoadedRef: RefObject<boolean>;
  triggeredAnalysisRef: RefObject<Set<string>>;
  serverPipelineRef: RefObject<Set<string>>;
}) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  // Mirrored so handleRetry can find the failed upload WITHOUT reading
  // state inside the setUploads updater (see handleRetry below).
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = useCallback(
    async (
      file: File,
      onUploaded?: (documentId: string) => void,
      onUploadError?: (message: string, retryable?: boolean) => void,
    ) => {
      const fid = familyIdRef.current ?? await ensureFamilyId();
      if (!fid) {
        // Returning silently left the caller (and the wizard) waiting
        // forever. Report it so the upload gets an error state and a retry.
        onUploadError?.(
          "Deine Familie konnte nicht geladen werden. Bitte Verbindung prüfen und erneut versuchen.",
          true,
        );
        return;
      }

      // Downscale large gallery/camera photos before upload — multi-MB
      // originals are the slowest part of the flow on mobile networks,
      // and OCR reads a ~2000px JPEG just as well. Best-effort: on any
      // failure the original file is used unchanged.
      file = await prepareImageForUpload(file);

      const validation = validateFile(file.type, file.size);
      if (!validation.valid) {
        // A rejected type or size can never succeed on a retry of the same
        // file — the wizard must offer a different file instead.
        onUploadError?.(validation.error, false);
        const uploadId = crypto.randomUUID();
        setUploads((prev) => [
          ...prev,
          { id: uploadId, file, progress: 0, phase: "error", error: validation.error },
        ]);
        return;
      }

      const uploadId = crypto.randomUUID();
      setUploads((prev) => [
        ...prev,
        { id: uploadId, file, progress: 0, phase: "uploading" },
      ]);

      try {
        const result = await uploadFile(file, fid, (percent) => {
          setUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId ? { ...upload, progress: percent } : upload,
            ),
          );
        });

        onUploaded?.(result.document_id);

        // When the server-side pipeline is active, it handles OCR + analyze
        // via the job queue (drained in next/server after()). The client
        // skips triggerOcr and auto-analyze to avoid 409 race conditions —
        // realtime/polling update the UI as the server progresses.
        if (result.server_pipeline) {
          serverPipelineRef.current.add(result.document_id);
          triggeredAnalysisRef.current.add(result.document_id);
        }

        if (documentsLoadedRef.current) {
          await fetchDocumentsRef.current(fid);
        }

        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === uploadId
              ? { ...upload, phase: "processing", progress: 100 }
              : upload,
          ),
        );

        setTimeout(() => {
          setUploads((prev) => prev.filter((upload) => upload.id !== uploadId));
        }, 1200);

        // Only trigger OCR from the client when the server pipeline is NOT
        // active (PIPELINE_MODE=sync). Otherwise the server's job queue
        // handles it, and both racing on the same document caused 409s.
        if (!result.server_pipeline) {
          triggerOcr(result.document_id)
            .then(() => {
              // OCR finished — kick the analysis immediately instead of
              // waiting for the next poll tick to notice `ocr_done`.
              void fetchDocumentByIdRef.current(result.document_id, {
                syncWizard: Boolean(onUploaded),
                syncList: documentsLoadedRef.current,
                allowAutoAnalyze: true,
              });
            })
            .catch(() => {
              if (documentsLoadedRef.current) {
                void fetchDocumentsRef.current(fid);
              }
            });
        }

        void fetchDocumentByIdRef.current(result.document_id, {
          syncWizard: Boolean(onUploaded),
          syncList: documentsLoadedRef.current,
          allowAutoAnalyze: false,
        });

        setTimeout(() => {
          if (documentsLoadedRef.current) {
            void fetchDocumentsRef.current(fid);
          }
          if (onUploaded && !result.server_pipeline) {
            void fetchDocumentByIdRef.current(result.document_id, {
              syncWizard: true,
              syncList: documentsLoadedRef.current,
              allowAutoAnalyze: true,
            });
          }
        }, 1500);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Upload hat nicht geklappt. Bitte nochmal versuchen.";
        onUploadError?.(message);
        setUploads((prev) =>
          prev.map((upload) =>
            upload.id === uploadId
              ? { ...upload, phase: "error", error: message }
              : upload,
          ),
        );
      }
    },
    [
      ensureFamilyId,
      familyIdRef,
      fetchDocumentsRef,
      fetchDocumentByIdRef,
      documentsLoadedRef,
      triggeredAnalysisRef,
      serverPipelineRef,
    ],
  );

  const handleRetry = useCallback(
    (uploadId: string) => {
      // Read the upload BEFORE dispatching the state update, then trigger
      // the re-upload outside the updater. Calling handleFileUpload inside
      // the setUploads updater made the updater impure — React StrictMode
      // double-invokes updaters, so one click on "Nochmal versuchen"
      // uploaded the same file twice.
      const upload = uploadsRef.current.find(
        (current) => current.id === uploadId,
      );
      setUploads((prev) => prev.filter((current) => current.id !== uploadId));
      if (upload) {
        void handleFileUpload(upload.file);
      }
    },
    [handleFileUpload],
  );

  const dismissUpload = useCallback((uploadId: string) => {
    setUploads((prev) => prev.filter((upload) => upload.id !== uploadId));
  }, []);

  const handleCameraSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = "";
      }
    },
    [handleFileUpload],
  );

  const handlePdfSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
      if (pdfInputRef.current) {
        pdfInputRef.current.value = "";
      }
    },
    [handleFileUpload],
  );

  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types?.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types?.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(event.dataTransfer.files);
      for (const file of files) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload],
  );

  return {
    uploads,
    isDragOver,
    cameraInputRef,
    pdfInputRef,
    dropZoneRef,
    handleFileUpload,
    handleRetry,
    dismissUpload,
    handleCameraSelect,
    handlePdfSelect,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
