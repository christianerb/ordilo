"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useScanPipelineRefs } from "@/lib/scan/scan-pipeline-refs";
import { useFamilyId } from "@/lib/scan/use-family-id";
import { useDocumentList } from "@/lib/scan/use-document-list";
import { useUploadQueue } from "@/lib/scan/use-upload-queue";
import { useDocumentActions } from "@/lib/scan/use-document-actions";
import {
  useScanWizardHandlers,
  useScanWizardState,
} from "@/lib/scan/use-scan-wizard-state";
import type {
  ScanContextValue,
  ScanProviderState,
} from "@/lib/scan/scan-context-types";

/**
 * Composition root for the scan feature's shared state.
 *
 * The work lives in cohesive sub-hooks (see the imports above); this hook
 * wires them together. The sub-hooks call into each other in a cycle — an
 * upload refetches the list, a list fetch can advance the wizard, the
 * wizard starts uploads — so they communicate through the stable
 * callback refs from {@link useScanPipelineRefs} instead of direct
 * dependencies (see that module for the rationale).
 *
 * Composition order matters within a render:
 *   1. family id + shared pipeline refs + wizard state slice
 *   2. document list (fills the fetch refs, syncs the wizard slice)
 *   3. upload queue (consumes the fetch refs)
 *   4. document actions (consumes list + wizard slice)
 *   5. wizard handlers (consume the upload queue + actions)
 * Refs filled during step 2 are only CALLED at event/poll time, so every
 * consumer always reaches the latest closure.
 */
export function useScanProviderState(): ScanProviderState {
  const supabase = createClient();
  const router = useRouter();

  const { familyIdRef, ensureFamilyId } = useFamilyId(supabase);
  const {
    fetchDocumentsRef,
    fetchDocumentByIdRef,
    triggeredAnalysisRef,
    serverPipelineRef,
    documentsLoadedRef,
  } = useScanPipelineRefs();

  const wizard = useScanWizardState();

  const {
    documents,
    setDocuments,
    documentsRef,
    loadingDocs,
    documentsError,
    expandedDocId,
    setExpandedDocId,
    expandedDocument,
    expandedDocIdRef,
    loadDocuments,
    updateTrackedDocument,
    openDocument,
    closeDocument,
    handleConfirmSuccess,
    handleReanalyzeSuccess,
  } = useDocumentList({
    supabase,
    ensureFamilyId,
    familyIdRef,
    fetchDocumentsRef,
    fetchDocumentByIdRef,
    triggeredAnalysisRef,
    documentsLoadedRef,
    wizardOpenRef: wizard.wizardOpenRef,
    wizardStepRef: wizard.wizardStepRef,
    wizardDocIdRef: wizard.wizardDocIdRef,
    wizardDocumentRef: wizard.wizardDocumentRef,
    setWizardDocument: wizard.setWizardDocument,
    setWizardStep: wizard.setWizardStep,
  });

  const {
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
  } = useUploadQueue({
    ensureFamilyId,
    familyIdRef,
    fetchDocumentsRef,
    fetchDocumentByIdRef,
    documentsLoadedRef,
    triggeredAnalysisRef,
    serverPipelineRef,
  });

  const {
    handleRetryFailed,
    handleDeleteDocument,
    createNoteOpen,
    openCreateNote,
    closeCreateNote,
    handleCreateNote,
  } = useDocumentActions({
    supabase,
    ensureFamilyId,
    familyIdRef,
    fetchDocumentsRef,
    fetchDocumentByIdRef,
    documentsLoadedRef,
    triggeredAnalysisRef,
    serverPipelineRef,
    documentsRef,
    setDocuments,
    expandedDocIdRef,
    updateTrackedDocument,
    closeDocument,
    wizardDocIdRef: wizard.wizardDocIdRef,
    setWizardDocId: wizard.setWizardDocId,
    setWizardDocument: wizard.setWizardDocument,
  });

  const {
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
  } = useScanWizardHandlers({
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
  });

  const value = useMemo<ScanContextValue>(
    () => ({
      documents,
      loadingDocs,
      documentsError,
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
      documentsError,
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
    wizardDocument: wizard.wizardDocument,
    wizardOpen: wizard.wizardOpen,
    wizardStep: wizard.wizardStep,
    wizardUploadError: wizard.wizardUploadError,
    wizardGalleryInputRef: wizard.wizardGalleryInputRef,
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
    handleWizardScanNext,
    handleWizardRetake,
    handleWizardCreateNote,
    createNoteOpen,
    openCreateNote,
    closeCreateNote,
    handleCreateNote,
  };
}
