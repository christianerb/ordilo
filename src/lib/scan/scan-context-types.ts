"use client";

import type {
  ChangeEvent,
  DragEvent,
  RefObject,
} from "react";
import type { ScanWizardStep } from "@/components/ordilo/scan-wizard/scan-wizard";
import type { UploadState } from "@/components/ordilo/scan-wizard/upload-progress";
import type { Database } from "@/types/database";

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export interface ScanActionsValue {
  openWizard: () => void;
  /** Opens the device picker for a photo or PDF. */
  openUploadPicker: () => void;
  /**
   * Open the create-note sheet. Pass `{ category }` to file the note into a
   * collection (the collection's name becomes the note's category).
   */
  openCreateNote: (options?: { category?: string }) => void;
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
  /**
   * Set when the document list could not be read. Without this a failed
   * query was indistinguishable from an empty family, so a family with 200
   * documents saw "Noch nichts gescannt".
   */
  documentsError: string | null;
  loadDocuments: () => Promise<void>;
  /**
   * Seed the list with server-rendered documents instead of refetching on
   * mount. No-op once the provider holds live data (SPA navigations).
   */
  seedDocuments: (initialDocuments: DocumentRow[]) => void;
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
  /** Resolves true when the document was really deleted, false on failure. */
  handleDeleteDocument: (documentId: string) => Promise<boolean>;
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
  handleWizardScanNext: () => void;
  handleWizardRetake: () => void;
  handleWizardCreateNote: () => void;
  openCreateNote: (options?: { category?: string }) => void;
  closeCreateNote: () => void;
  /** The collection category the note is being filed into, if any. */
  createNoteCategory: string | null;
  handleCreateNote: (params: {
    title: string;
    content: string;
    documentType: import("@/lib/schemas/extraction").DocumentType;
    file: File | null;
  }) => Promise<void>;
}
