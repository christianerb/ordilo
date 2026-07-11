"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getFamilyId } from "@/lib/supabase/client-helpers";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { triggerOcr } from "@/lib/ocr";
import {
  getFailedStage,
  isProcessingStatus,
  validateFile,
} from "@/lib/schemas/document";
import { uploadFile } from "@/lib/upload";
import { createNote } from "@/lib/notes";
import type { DocumentType } from "@/lib/schemas/extraction";
import type {
  DocumentRow,
  ScanContextValue,
  ScanProviderState,
} from "@/lib/scan/scan-context-types";
import type { ScanWizardStep } from "@/components/ordilo/scan-wizard/scan-wizard";
import type { UploadState } from "@/components/ordilo/scan-wizard/upload-progress";

export function useScanProviderState(): ScanProviderState {
  const supabase = createClient();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [expandedDocument, setExpandedDocument] = useState<DocumentRow | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<ScanWizardStep>("camera");
  const [wizardDocId, setWizardDocId] = useState<string | null>(null);
  const [wizardDocument, setWizardDocument] = useState<DocumentRow | null>(null);
  const [wizardUploadError, setWizardUploadError] = useState<string | null>(null);
  const [createNoteOpen, setCreateNoteOpen] = useState(false);

  const triggeredAnalysisRef = useRef<Set<string>>(new Set());
  const seededPreExistingRef = useRef(false);
  const initialDocumentsLoadedRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const wizardGalleryInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const wizardFileRef = useRef<File | null>(null);

  const fetchDocumentsRef = useRef<(familyIdOverride?: string) => Promise<void>>(
    () => Promise.resolve(),
  );
  const fetchDocumentByIdRef = useRef<
    (
      documentId: string,
      options?: {
        syncExpanded?: boolean;
        syncWizard?: boolean;
        syncList?: boolean;
        allowAutoAnalyze?: boolean;
      },
    ) => Promise<DocumentRow | null>
  >(() => Promise.resolve(null));
  const triggerAnalysisRef = useRef<(documentId: string) => Promise<void>>(
    () => Promise.resolve(),
  );
  const familyIdRef = useRef(familyId);
  familyIdRef.current = familyId;
  const familyIdResolvedRef = useRef(false);
  const familyIdPromiseRef = useRef<Promise<string | null> | null>(null);
  const wizardOpenRef = useRef(wizardOpen);
  wizardOpenRef.current = wizardOpen;
  const wizardStepRef = useRef(wizardStep);
  wizardStepRef.current = wizardStep;
  const wizardDocIdRef = useRef(wizardDocId);
  wizardDocIdRef.current = wizardDocId;
  const wizardDocumentRef = useRef(wizardDocument);
  wizardDocumentRef.current = wizardDocument;
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const expandedDocIdRef = useRef(expandedDocId);
  expandedDocIdRef.current = expandedDocId;
  const expandedDocumentRef = useRef(expandedDocument);
  expandedDocumentRef.current = expandedDocument;
  const documentsLoadedRef = useRef(false);

  const ensureFamilyId = useCallback(async () => {
    if (familyIdResolvedRef.current) {
      return familyIdRef.current;
    }
    if (familyIdPromiseRef.current) {
      return familyIdPromiseRef.current;
    }

    const promise = getFamilyId(supabase).then((id) => {
      familyIdResolvedRef.current = true;
      familyIdRef.current = id;
      setFamilyId(id);
      familyIdPromiseRef.current = null;
      return id;
    });

    familyIdPromiseRef.current = promise;
    return promise;
  }, [supabase]);

  const fetchDocuments = useCallback(async (familyIdOverride?: string) => {
    const fid = familyIdOverride ?? familyIdRef.current ?? await ensureFamilyId();
    if (!fid) {
      documentsLoadedRef.current = true;
      initialDocumentsLoadedRef.current = true;
      setDocuments([]);
      setLoadingDocs(false);
      return;
    }

    if (!initialDocumentsLoadedRef.current) {
      setLoadingDocs(true);
    }

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("family_id", fid)
      .order("created_at", { ascending: false });

    if (!error && data) {
      if (!seededPreExistingRef.current) {
        for (const doc of data) {
          if (doc.status === "ocr_done") {
            triggeredAnalysisRef.current.add(doc.id);
          }
        }
        seededPreExistingRef.current = true;
      }

      setDocuments(data);
      documentsLoadedRef.current = true;

      if (expandedDocIdRef.current) {
        setExpandedDocument(
          data.find((doc) => doc.id === expandedDocIdRef.current) ?? null,
        );
      }
      if (wizardDocIdRef.current) {
        setWizardDocument(
          data.find((doc) => doc.id === wizardDocIdRef.current) ?? null,
        );
      }

      for (const doc of data) {
        if (doc.status === "ocr_done" && !triggeredAnalysisRef.current.has(doc.id)) {
          triggeredAnalysisRef.current.add(doc.id);
          setDocuments((prev) =>
            prev.map((current) =>
              current.id === doc.id
                ? { ...current, status: "analyzing", error_message: null }
                : current,
            ),
          );
          triggerAnalysisRef.current(doc.id);
        }
      }

      if (
        wizardOpenRef.current &&
        wizardStepRef.current === "processing" &&
        wizardDocIdRef.current
      ) {
        const currentWizardDoc = data.find((doc) => doc.id === wizardDocIdRef.current);
        if (currentWizardDoc?.status === "analyzed") {
          setWizardStep("review");
        }
      }
    }

    initialDocumentsLoadedRef.current = true;
    setLoadingDocs(false);
  }, [ensureFamilyId, supabase]);
  fetchDocumentsRef.current = fetchDocuments;

  const fetchDocumentById = useCallback(
    async (
      documentId: string,
      options?: {
        syncExpanded?: boolean;
        syncWizard?: boolean;
        syncList?: boolean;
        allowAutoAnalyze?: boolean;
      },
    ) => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .order("created_at", { ascending: false });

      const document = data?.[0] ?? null;

      if (error || !document) {
        if (options?.syncExpanded && expandedDocIdRef.current === documentId) {
          setExpandedDocument(null);
        }
        if (options?.syncWizard && wizardDocIdRef.current === documentId) {
          setWizardDocument(null);
        }
        return null;
      }

      if (options?.syncList && documentsLoadedRef.current) {
        setDocuments((prev) => {
          const next = prev.some((doc) => doc.id === document.id)
            ? prev.map((doc) => (doc.id === document.id ? document : doc))
            : [document, ...prev];
          return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
        });
      }

      if (options?.syncExpanded && expandedDocIdRef.current === documentId) {
        setExpandedDocument(document);
      }
      if (options?.syncWizard && wizardDocIdRef.current === documentId) {
        setWizardDocument(document);
      }

      if (
        options?.allowAutoAnalyze &&
        document.status === "ocr_done" &&
        !triggeredAnalysisRef.current.has(document.id)
      ) {
        triggeredAnalysisRef.current.add(document.id);
        const optimisticDoc = {
          ...document,
          status: "analyzing" as DocumentRow["status"],
          error_message: null,
        };

        if (options.syncList && documentsLoadedRef.current) {
          setDocuments((prev) =>
            prev.map((doc) => (doc.id === document.id ? optimisticDoc : doc)),
          );
        }
        if (options.syncExpanded && expandedDocIdRef.current === documentId) {
          setExpandedDocument(optimisticDoc);
        }
        if (options.syncWizard && wizardDocIdRef.current === documentId) {
          setWizardDocument(optimisticDoc);
        }
        void triggerAnalysisRef.current(document.id);
        return optimisticDoc;
      }

      if (
        options?.syncWizard &&
        wizardOpenRef.current &&
        wizardStepRef.current === "processing" &&
        wizardDocIdRef.current === documentId &&
        document.status === "analyzed"
      ) {
        setWizardStep("review");
      }

      return document;
    },
    [supabase],
  );
  fetchDocumentByIdRef.current = fetchDocumentById;

  const loadDocuments = useCallback(async () => {
    await fetchDocumentsRef.current();
  }, []);

  const handleFileUpload = useCallback(
    async (
      file: File,
      onUploaded?: (documentId: string) => void,
      onUploadError?: (message: string) => void,
    ) => {
      const fid = familyIdRef.current ?? await ensureFamilyId();
      if (!fid) return;

      const validation = validateFile(file.type, file.size);
      if (!validation.valid) {
        onUploadError?.(validation.error);
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

        triggerOcr(result.document_id).catch(() => {
          if (documentsLoadedRef.current) {
            void fetchDocumentsRef.current(fid);
          }
        });

        void fetchDocumentByIdRef.current(result.document_id, {
          syncWizard: Boolean(onUploaded),
          syncList: documentsLoadedRef.current,
          allowAutoAnalyze: false,
        });

        setTimeout(() => {
          if (documentsLoadedRef.current) {
            void fetchDocumentsRef.current(fid);
          }
          if (onUploaded) {
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
    [ensureFamilyId],
  );

  const handleRetry = useCallback(
    (uploadId: string) => {
      setUploads((prev) => {
        const upload = prev.find((current) => current.id === uploadId);
        if (upload) {
          handleFileUpload(upload.file);
        }
        return prev.filter((current) => current.id !== uploadId);
      });
    },
    [handleFileUpload],
  );

  const dismissUpload = useCallback((uploadId: string) => {
    setUploads((prev) => prev.filter((upload) => upload.id !== uploadId));
  }, []);

  const updateTrackedDocument = useCallback(
    (documentId: string, updater: (doc: DocumentRow) => DocumentRow) => {
      if (documentsLoadedRef.current) {
        setDocuments((prev) =>
          prev.map((doc) => (doc.id === documentId ? updater(doc) : doc)),
        );
      }
      if (expandedDocumentRef.current?.id === documentId) {
        setExpandedDocument((prev) => (prev ? updater(prev) : prev));
      }
      if (wizardDocumentRef.current?.id === documentId) {
        setWizardDocument((prev) => (prev ? updater(prev) : prev));
      }
    },
    [],
  );

  const hasProcessingDocs = documents.some((doc) => isProcessingStatus(doc.status));
  const hasProcessingDocsRef = useRef(hasProcessingDocs);
  hasProcessingDocsRef.current = hasProcessingDocs;

  useMountEffect(() => {
    const interval = setInterval(() => {
      if (documentsLoadedRef.current && hasProcessingDocsRef.current) {
        void fetchDocumentsRef.current();
      }
      if (
        expandedDocIdRef.current &&
        expandedDocumentRef.current &&
        isProcessingStatus(expandedDocumentRef.current.status)
      ) {
        void fetchDocumentByIdRef.current(expandedDocIdRef.current, {
          syncExpanded: true,
        });
      }
      if (
        wizardOpenRef.current &&
        wizardStepRef.current === "processing" &&
        wizardDocIdRef.current &&
        (!wizardDocumentRef.current ||
          wizardDocumentRef.current.status === "ocr_done" ||
          isProcessingStatus(wizardDocumentRef.current.status))
      ) {
        void fetchDocumentByIdRef.current(wizardDocIdRef.current, {
          syncWizard: true,
          syncList: documentsLoadedRef.current,
          allowAutoAnalyze: true,
        });
      }
    }, 3000);
    return () => clearInterval(interval);
  });

  const handleRetryFailed = useCallback(
    async (documentId: string) => {
      const document =
        documentsRef.current.find((doc) => doc.id === documentId) ??
        (expandedDocumentRef.current?.id === documentId
          ? expandedDocumentRef.current
          : null) ??
        await fetchDocumentByIdRef.current(documentId, {
          syncExpanded: expandedDocIdRef.current === documentId,
        });
      if (!document) return;

      const stage = getFailedStage(document);

      if (stage === "ocr") {
        updateTrackedDocument(documentId, (current) => ({
          ...current,
          status: "ocr_processing",
          error_message: null,
        }));
        try {
          await triggerOcr(documentId);
        } catch {}
        if (documentsLoadedRef.current) {
          await fetchDocumentsRef.current();
        }
        await fetchDocumentByIdRef.current(documentId, {
          syncExpanded: expandedDocIdRef.current === documentId,
          syncWizard: wizardDocIdRef.current === documentId,
          syncList: documentsLoadedRef.current,
          allowAutoAnalyze: true,
        });
        return;
      }

      updateTrackedDocument(documentId, (current) => ({
        ...current,
        status: "analyzing",
        error_message: null,
      }));
      try {
        await fetch(`/api/documents/${documentId}/analyze`, { method: "POST" });
      } catch {}
      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current();
      }
      await fetchDocumentByIdRef.current(documentId, {
        syncExpanded: expandedDocIdRef.current === documentId,
        syncWizard: wizardDocIdRef.current === documentId,
        syncList: documentsLoadedRef.current,
      });
    },
    [updateTrackedDocument],
  );

  const triggerAnalysis = useCallback(async (documentId: string) => {
    try {
      await fetch(`/api/documents/${documentId}/analyze`, { method: "POST" });
    } catch {}
    if (documentsLoadedRef.current) {
      await fetchDocumentsRef.current();
    }
    await fetchDocumentByIdRef.current(documentId, {
      syncExpanded: expandedDocIdRef.current === documentId,
      syncWizard: wizardDocIdRef.current === documentId,
      syncList: documentsLoadedRef.current,
    });
  }, []);
  triggerAnalysisRef.current = triggerAnalysis;

  const handleConfirmSuccess = useCallback(() => {
    if (documentsLoadedRef.current) {
      void fetchDocumentsRef.current();
      return;
    }
    if (expandedDocIdRef.current) {
      void fetchDocumentByIdRef.current(expandedDocIdRef.current, {
        syncExpanded: true,
      });
    }
  }, []);

  const handleReanalyzeSuccess = useCallback(() => {
    if (documentsLoadedRef.current) {
      void fetchDocumentsRef.current();
    }
    if (expandedDocIdRef.current) {
      void fetchDocumentByIdRef.current(expandedDocIdRef.current, {
        syncExpanded: true,
        syncList: documentsLoadedRef.current,
      });
    }
  }, []);

  const openDocument = useCallback(async (documentId: string) => {
    const existing = documentsRef.current.find((doc) => doc.id === documentId);
    if (existing) {
      setExpandedDocument(existing);
      setExpandedDocId(documentId);
      return;
    }
    const document = await fetchDocumentByIdRef.current(documentId);
    if (document) {
      setExpandedDocument(document);
      setExpandedDocId(documentId);
    }
  }, []);

  const closeDocument = useCallback(() => {
    setExpandedDocId(null);
    setExpandedDocument(null);
  }, []);

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      // Delete via the API route so the Storage file is removed with the
      // service-role client (the private bucket rejects browser-client
      // removals, which used to orphan files).
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "DELETE",
        });
        if (!response.ok) return;
      } catch {
        return;
      }
      if (expandedDocIdRef.current === documentId) {
        closeDocument();
      }
      if (wizardDocIdRef.current === documentId) {
        setWizardDocId(null);
        setWizardDocument(null);
      }
      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current();
      } else {
        setDocuments((prev) => prev.filter((current) => current.id !== documentId));
      }
    },
    [closeDocument],
  );

  const openWizard = useCallback(() => {
    wizardStepRef.current = "camera";
    setWizardStep("camera");
    wizardDocIdRef.current = null;
    setWizardDocId(null);
    setWizardDocument(null);
    setWizardUploadError(null);
    wizardFileRef.current = null;
    setWizardOpen(true);
  }, []);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setWizardDocument(null);
    setWizardUploadError(null);
  }, []);

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
        (message) => setWizardUploadError(message),
      );
    },
    [handleFileUpload],
  );

  const handleWizardUseGallery = useCallback(() => {
    wizardGalleryInputRef.current?.click();
  }, []);

  const handleWizardGallerySelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleWizardCapture(file);
      }
      if (wizardGalleryInputRef.current) {
        wizardGalleryInputRef.current.value = "";
      }
    },
    [handleWizardCapture],
  );

  const handleWizardRetryUpload = useCallback(() => {
    const file = wizardFileRef.current;
    if (file) {
      handleWizardCapture(file);
    } else {
      setWizardStep("camera");
    }
  }, [handleWizardCapture]);

  const handleWizardReviewDone = useCallback(() => {
    setWizardOpen(false);
    setWizardDocId(null);
    setWizardDocument(null);
    if (documentsLoadedRef.current) {
      void fetchDocumentsRef.current();
    }
  }, []);

  const openCreateNote = useCallback(() => {
    setCreateNoteOpen(true);
  }, []);

  // From the camera step: switch to writing a note — close the wizard and
  // open the note sheet in one tap (the camera is the app's add-hub).
  const handleWizardCreateNote = useCallback(() => {
    closeWizard();
    openCreateNote();
  }, [closeWizard, openCreateNote]);

  const closeCreateNote = useCallback(() => {
    setCreateNoteOpen(false);
  }, []);

  const handleCreateNote = useCallback(
    async (params: {
      title: string;
      content: string;
      documentType: DocumentType;
      file: File | null;
    }) => {
      const fid = familyIdRef.current ?? await ensureFamilyId();
      if (!fid) return;

      const result = await createNote({
        title: params.title,
        content: params.content,
        documentType: params.documentType,
        familyId: fid,
        file: params.file,
      });

      // Refresh the document list so the new note appears.
      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current(fid);
      }

      // Trigger analysis (same as the scan pipeline does after OCR).
      // The scan context's polling will pick up the "analyzing" → "analyzed"
      // transition and the document will appear in the review queue.
      try {
        await fetch(`/api/documents/${result.document_id}/analyze`, {
          method: "POST",
        });
      } catch {
        // Analysis trigger failed — the document is still in "ocr_done"
        // and the polling loop will retry automatically.
      }

      // Fetch the updated document to reflect the "analyzing" status.
      if (documentsLoadedRef.current) {
        await fetchDocumentsRef.current(fid);
      }
    },
    [ensureFamilyId],
  );

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

  const value = useMemo<ScanContextValue>(
    () => ({
      documents,
      loadingDocs,
      loadDocuments,
      uploads,
      isDragOver,
      expandedDocId,
      openDocument,
      closeDocument,
      setExpandedDocId,
      cameraInputRef,
      pdfInputRef,
      dropZoneRef,
      handleCameraSelect,
      handlePdfSelect,
      handleDragEnter,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleRetry,
      dismissUpload,
      handleRetryFailed,
      handleDeleteDocument,
      handleConfirmSuccess,
      handleReanalyzeSuccess,
      openWizard,
      openCreateNote,
      closeCreateNote,
      handleCreateNote,
    }),
    [
      documents,
      loadingDocs,
      loadDocuments,
      uploads,
      isDragOver,
      expandedDocId,
      openDocument,
      closeDocument,
      handleCameraSelect,
      handlePdfSelect,
      handleDragEnter,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleRetry,
      dismissUpload,
      handleRetryFailed,
      handleDeleteDocument,
      handleConfirmSuccess,
      handleReanalyzeSuccess,
      openWizard,
      openCreateNote,
      closeCreateNote,
      handleCreateNote,
    ],
  );

  const scanActionsValue = useMemo(
    () => ({ openWizard, openCreateNote, closeCreateNote, handleCreateNote }),
    [openWizard, openCreateNote, closeCreateNote, handleCreateNote],
  );
  const documentViewerValue = useMemo(
    () => ({ openDocument, closeDocument }),
    [closeDocument, openDocument],
  );

  return {
    value,
    scanActionsValue,
    documentViewerValue,
    expandedDocument,
    wizardDocument,
    wizardOpen,
    wizardStep,
    wizardUploadError,
    wizardGalleryInputRef,
    closeDocument,
    closeWizard,
    handleConfirmSuccess,
    handleReanalyzeSuccess,
    handleRetryFailed,
    handleWizardCapture,
    handleWizardUseGallery,
    handleWizardRetryUpload,
    handleWizardGallerySelect,
    handleWizardReviewDone,
      handleWizardCreateNote,
    createNoteOpen,
    openCreateNote,
    closeCreateNote,
    handleCreateNote,
  };
}
