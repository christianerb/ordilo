"use client";

import type {
  ChangeEvent,
  DragEvent,
  RefObject,
} from "react";
import type { ScanWizardStep } from "@/components/ordilo/scan-wizard/scan-wizard";
import type { EditedAnalysisPayload } from "@/components/ordilo/review-card/helpers";
import type { UploadState } from "@/components/ordilo/scan-wizard/upload-progress";
import type { Database } from "@/types/database";

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export interface ScanActionsValue {
  openWizard: () => void;
  openCreateNote: () => void;
  closeCreateNote: () => void;
  handleCreateNote: (params: {
    title: string;
    content: string;
    documentType: import("@/lib/schemas/extraction").DocumentType;
    file: File | null;
  }) => Promise<void>;
}

export interface DocumentViewerValue {
  openDocument: (documentId: string) => Promise<void>;
  closeDocument: () => void;
}

export interface ScanContextValue extends ScanActionsValue, DocumentViewerValue {
  documents: DocumentRow[];
  loadingDocs: boolean;
  loadDocuments: () => Promise<void>;
  uploads: UploadState[];
  isDragOver: boolean;
  expandedDocId: string | null;
  setExpandedDocId: (id: string | null) => void;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  pdfInputRef: RefObject<HTMLInputElement | null>;
  dropZoneRef: RefObject<HTMLDivElement | null>;
  handleCameraSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePdfSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  handleDragEnter: (e: DragEvent) => void;
  handleDragOver: (e: DragEvent) => void;
  handleDragLeave: (e: DragEvent) => void;
  handleDrop: (e: DragEvent) => void;
  handleRetry: (uploadId: string) => void;
  dismissUpload: (uploadId: string) => void;
  handleRetryFailed: (documentId: string) => Promise<void>;
  handleDeleteDocument: (documentId: string) => Promise<void>;
  handleConfirmSuccess: () => void;
  handleReanalyzeSuccess: () => void;
}

export interface ScanProviderState {
  value: ScanContextValue;
  scanActionsValue: ScanActionsValue;
  documentViewerValue: DocumentViewerValue;
  expandedDocument: DocumentRow | null;
  wizardDocument: DocumentRow | null;
  wizardOpen: boolean;
  wizardStep: ScanWizardStep;
  wizardUploadError: string | null;
  wizardGalleryInputRef: RefObject<HTMLInputElement | null>;
  createNoteOpen: boolean;
  closeDocument: () => void;
  closeWizard: () => void;
  handleConfirmSuccess: () => void;
  handleReanalyzeSuccess: () => void;
  handleRetryFailed: (documentId: string) => Promise<void>;
  handleWizardCapture: (file: File) => void;
  handleWizardUseGallery: () => void;
  handleWizardRetryUpload: () => void;
  handleWizardGallerySelect: (e: ChangeEvent<HTMLInputElement>) => void;
  handleWizardReviewDone: () => void;
  handleWizardAutoFlush: (
    documentId: string,
    payload: EditedAnalysisPayload,
  ) => void;
  handleWizardCreateNote: () => void;
  openCreateNote: () => void;
  closeCreateNote: () => void;
  handleCreateNote: (params: {
    title: string;
    content: string;
    documentType: import("@/lib/schemas/extraction").DocumentType;
    file: File | null;
  }) => Promise<void>;
}
