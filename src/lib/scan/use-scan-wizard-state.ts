"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DocumentRow } from "@/lib/scan/scan-context-types";
import type { ScanWizardStep } from "@/components/ordilo/scan-wizard/scan-wizard";
import type {
  FetchDocumentByIdFn,
  FetchDocumentsFn,
} from "@/lib/scan/scan-pipeline-refs";

type AppRouter = ReturnType<typeof useRouter>;

export interface ScanWizardState {
  wizardOpen: boolean;
  wizardStep: ScanWizardStep;
  wizardDocId: string | null;
  wizardDocument: DocumentRow | null;
  wizardUploadError: string | null;
  setWizardOpen: Dispatch<SetStateAction<boolean>>;
  setWizardStep: Dispatch<SetStateAction<ScanWizardStep>>;
  setWizardDocId: Dispatch<SetStateAction<string | null>>;
  setWizardDocument: Dispatch<SetStateAction<DocumentRow | null>>;
  setWizardUploadError: Dispatch<SetStateAction<string | null>>;
  wizardOpenRef: RefObject<boolean>;
  wizardStepRef: RefObject<ScanWizardStep>;
  wizardDocIdRef: RefObject<string | null>;
  wizardDocumentRef: RefObject<DocumentRow | null>;
  wizardFileRef: RefObject<File | null>;
  wizardGalleryInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The scan wizard's state slice: step, tracked document, upload error, and
 * the captured file.
 *
 * The ref mirrors exist because the document list's fetch/poll logic reads
 * wizard state at event and poll time (to sync the tracked document and to
 * advance processing → review), and the wizard's own handlers write it
 * between renders — depending on render-time state there would either go
 * stale or re-create the stable callbacks every render.
 *
 * Kept separate from {@link useScanWizardHandlers} because the document
 * list's fetch logic needs these refs before the upload queue (which the
 * handlers depend on) exists.
 */
export function useScanWizardState(): ScanWizardState {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<ScanWizardStep>("camera");
  const [wizardDocId, setWizardDocId] = useState<string | null>(null);
  const [wizardDocument, setWizardDocument] = useState<DocumentRow | null>(null);
  const [wizardUploadError, setWizardUploadError] = useState<string | null>(null);

  const wizardOpenRef = useRef(wizardOpen);
  wizardOpenRef.current = wizardOpen;
  const wizardStepRef = useRef(wizardStep);
  wizardStepRef.current = wizardStep;
  const wizardDocIdRef = useRef(wizardDocId);
  wizardDocIdRef.current = wizardDocId;
  const wizardDocumentRef = useRef(wizardDocument);
  wizardDocumentRef.current = wizardDocument;
  const wizardFileRef = useRef<File | null>(null);
  const wizardGalleryInputRef = useRef<HTMLInputElement>(null);

  return {
    wizardOpen,
    wizardStep,
    wizardDocId,
    wizardDocument,
    wizardUploadError,
    setWizardOpen,
    setWizardStep,
    setWizardDocId,
    setWizardDocument,
    setWizardUploadError,
    wizardOpenRef,
    wizardStepRef,
    wizardDocIdRef,
    wizardDocumentRef,
    wizardFileRef,
    wizardGalleryInputRef,
  };
}

/**
 * The scan wizard's event handlers: capture, gallery intake, upload retry,
 * review done, scan-next, retake, and the jump to note creation.
 */
export function useScanWizardHandlers({
  wizard,
  router,
  handleFileUpload,
  handleRetryFailed,
  fetchDocumentsRef,
  fetchDocumentByIdRef,
  documentsLoadedRef,
  documentsRef,
  setDocuments,
  openCreateNote,
}: {
  wizard: ScanWizardState;
  router: AppRouter;
  handleFileUpload: (
    file: File,
    onUploaded?: (documentId: string) => void,
    onUploadError?: (message: string, retryable?: boolean) => void,
  ) => Promise<void>;
  handleRetryFailed: (documentId: string) => Promise<void>;
  fetchDocumentsRef: RefObject<FetchDocumentsFn>;
  fetchDocumentByIdRef: RefObject<FetchDocumentByIdFn>;
  documentsLoadedRef: RefObject<boolean>;
  documentsRef: RefObject<DocumentRow[]>;
  setDocuments: Dispatch<SetStateAction<DocumentRow[]>>;
  openCreateNote: () => void;
}) {
  const {
    setWizardOpen,
    setWizardStep,
    setWizardDocId,
    setWizardDocument,
    setWizardUploadError,
    wizardStepRef,
    wizardDocIdRef,
    wizardDocumentRef,
    wizardFileRef,
    wizardGalleryInputRef,
  } = wizard;

  const openWizard = useCallback(() => {
    wizardStepRef.current = "camera";
    setWizardStep("camera");
    wizardDocIdRef.current = null;
    setWizardDocId(null);
    setWizardDocument(null);
    setWizardUploadError(null);
    wizardFileRef.current = null;
    setWizardOpen(true);
  }, [
    wizardStepRef,
    wizardDocIdRef,
    wizardFileRef,
    setWizardStep,
    setWizardDocId,
    setWizardDocument,
    setWizardUploadError,
    setWizardOpen,
  ]);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setWizardDocument(null);
    setWizardUploadError(null);
  }, [setWizardOpen, setWizardDocument, setWizardUploadError]);

  const handleWizardCapture = useCallback(
    (file: File) => {
      wizardFileRef.current = file;
      wizardStepRef.current = "processing";
      setWizardStep("processing");
      wizardDocIdRef.current = null;
      setWizardDocId(null);
      setWizardDocument(null);
      setWizardUploadError(null);
      handleFileUpload(
        file,
        (documentId) => {
          wizardDocIdRef.current = documentId;
          setWizardDocId(documentId);
          void fetchDocumentByIdRef.current(documentId, {
            syncWizard: true,
            syncList: documentsLoadedRef.current,
          });
        },
        (message, retryable = true) => {
          setWizardUploadError(message);
          if (!retryable) wizardFileRef.current = null;
        },
      );
    },
    [
      handleFileUpload,
      wizardFileRef,
      wizardStepRef,
      wizardDocIdRef,
      fetchDocumentByIdRef,
      documentsLoadedRef,
      setWizardStep,
      setWizardDocId,
      setWizardDocument,
      setWizardUploadError,
    ],
  );

  const handleWizardUseGallery = useCallback(() => {
    wizardGalleryInputRef.current?.click();
  }, [wizardGalleryInputRef]);

  const handleWizardGallerySelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      const [first, ...rest] = files;
      // The first file is followed through the wizard's guided flow; any
      // extras upload in the background and appear as progress cards on
      // the Dokumente page once the wizard closes.
      handleWizardCapture(first);
      for (const extra of rest) {
        handleFileUpload(extra);
      }
      if (wizardGalleryInputRef.current) {
        wizardGalleryInputRef.current.value = "";
      }
    },
    [handleWizardCapture, handleFileUpload, wizardGalleryInputRef],
  );

  const handleWizardRetryUpload = useCallback(() => {
    if (wizardDocIdRef.current && wizardDocumentRef.current?.status === "failed") {
      void handleRetryFailed(wizardDocIdRef.current);
      return;
    }
    const file = wizardFileRef.current;
    if (file) {
      handleWizardCapture(file);
    } else {
      // No retryable file (rejected type/size, or none captured): back to
      // capture so the user can choose a different one.
      wizardStepRef.current = "camera";
      setWizardUploadError(null);
      setWizardStep("camera");
    }
  }, [
    handleRetryFailed,
    handleWizardCapture,
    wizardDocIdRef,
    wizardDocumentRef,
    wizardFileRef,
    wizardStepRef,
    setWizardUploadError,
    setWizardStep,
  ]);

  const handleWizardReviewDone = useCallback(() => {
    setWizardOpen(false);
    setWizardDocId(null);
    setWizardDocument(null);
    if (documentsLoadedRef.current) {
      void fetchDocumentsRef.current();
    }
    // Home and the other pages are server components whose first-visit and
    // empty states come from props. Without this a brand-new family walked
    // the whole golden path — scan, review, confirm — and landed back on
    // "Scanne dein erstes Dokument", with no sign anything was saved.
    router.refresh();
  }, [
    router,
    documentsLoadedRef,
    fetchDocumentsRef,
    setWizardOpen,
    setWizardDocId,
    setWizardDocument,
  ]);

  // After a confirmed document: reopen the camera fresh so a stack of
  // letters can be scanned one after another without reopening the
  // wizard each time. The confirmed document stays in the family book.
  const handleWizardScanNext = useCallback(() => {
    wizardStepRef.current = "camera";
    setWizardStep("camera");
    wizardDocIdRef.current = null;
    setWizardDocId(null);
    setWizardDocument(null);
    wizardFileRef.current = null;
    setWizardUploadError(null);
    setWizardOpen(true);
    if (documentsLoadedRef.current) {
      void fetchDocumentsRef.current();
    }
  }, [
    wizardStepRef,
    wizardDocIdRef,
    wizardFileRef,
    documentsLoadedRef,
    fetchDocumentsRef,
    setWizardStep,
    setWizardDocId,
    setWizardDocument,
    setWizardUploadError,
    setWizardOpen,
  ]);

  // Discard the current (unconfirmed) document and re-capture: deletes
  // the server-side row + file so nothing orphaned remains, then reopens
  // the camera. Used when the scan/photo turned out bad and the user
  // wants to try again instead of confirming a bad document.
  //
  // Mirrors the document-delete pattern: optimistic remove, server DELETE,
  // and restore-on-failure with a toast so a silent DELETE error never
  // leaves the user thinking a document is gone when it isn't. The
  // concurrent OCR/analyze race is handled server-side (the analyze route
  // 404s on a missing row before writing anything).
  const handleWizardRetake = useCallback(async () => {
    const docId = wizardDocIdRef.current;
    const removed =
      documentsRef.current.find((doc) => doc.id === docId) ?? null;

    // Optimistic: drop from list + reset wizard to camera immediately.
    wizardDocIdRef.current = null;
    setWizardDocId(null);
    setWizardDocument(null);
    if (docId && documentsLoadedRef.current) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
    wizardStepRef.current = "camera";
    setWizardStep("camera");
    wizardFileRef.current = null;
    setWizardUploadError(null);
    setWizardOpen(true);

    if (!docId) return;

    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
    } catch {
      // Restore the document so the user knows it wasn't discarded.
      if (removed && documentsLoadedRef.current) {
        setDocuments((prev) =>
          prev.some((d) => d.id === docId) ? prev : [removed, ...prev],
        );
      }
      toast.error("Verwerfen hat nicht geklappt — das Dokument ist noch da.");
    }
  }, [
    wizardDocIdRef,
    wizardStepRef,
    wizardFileRef,
    documentsRef,
    documentsLoadedRef,
    setDocuments,
    setWizardDocId,
    setWizardDocument,
    setWizardStep,
    setWizardUploadError,
    setWizardOpen,
  ]);

  // From the camera step: switch to writing a note — close the wizard and
  // open the note sheet in one tap (the camera is the app's add-hub).
  const handleWizardCreateNote = useCallback(() => {
    closeWizard();
    openCreateNote();
  }, [closeWizard, openCreateNote]);

  return {
    openWizard,
    closeWizard,
    handleWizardCapture,
    handleWizardUseGallery,
    handleWizardGallerySelect,
    handleWizardRetryUpload,
    handleWizardReviewDone,
    handleWizardScanNext,
    handleWizardRetake,
    handleWizardCreateNote,
  };
}
