"use client";

import dynamic from "next/dynamic";
import { ACCEPTED_FILE_EXTENSIONS } from "@/lib/schemas/document";
import type { ScanProviderState } from "@/lib/scan/scan-context-types";

const ScanWizard = dynamic(() =>
  import("@/components/ordilo/scan-wizard/scan-wizard").then((m) => m.ScanWizard),
);
const DocumentDetailSheet = dynamic(() =>
  import("@/components/ordilo/document-detail-sheet").then((m) => m.DocumentDetailSheet),
);
const CreateNoteSheet = dynamic(() =>
  import("@/components/ordilo/create-note-sheet").then((m) => m.CreateNoteSheet),
);

export function ScanProviderOverlays({
  expandedDocId,
  expandedDocument,
  wizardDocument,
  wizardOpen,
  wizardStep,
  wizardUploadError,
  wizardGalleryInputRef,
  createNoteOpen,
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
  closeCreateNote,
  handleCreateNote,
  confirmedCount,
}: Pick<
  ScanProviderState,
  | "expandedDocument"
  | "wizardDocument"
  | "wizardOpen"
  | "wizardStep"
  | "wizardUploadError"
  | "wizardGalleryInputRef"
  | "createNoteOpen"
  | "closeDocument"
  | "closeWizard"
  | "handleConfirmSuccess"
  | "handleReanalyzeSuccess"
  | "handleRetryFailed"
  | "handleWizardCapture"
  | "handleWizardUseGallery"
  | "handleWizardRetryUpload"
  | "handleWizardGallerySelect"
  | "handleWizardReviewDone"
  | "handleWizardScanNext"
  | "handleWizardRetake"
  | "handleWizardCreateNote"
  | "closeCreateNote"
  | "handleCreateNote"
> & { expandedDocId: string | null; confirmedCount: number }) {
  return (
    <>
      <DocumentDetailSheet
        document={expandedDocument}
        open={expandedDocId !== null}
        onOpenChange={(open) => {
          if (!open) closeDocument();
        }}
        onConfirmSuccess={handleConfirmSuccess}
        onReanalyzeSuccess={handleReanalyzeSuccess}
        onRetry={handleRetryFailed}
      />

      <input
        ref={wizardGalleryInputRef}
        type="file"
        accept={ACCEPTED_FILE_EXTENSIONS}
        multiple
        className="hidden"
        onChange={handleWizardGallerySelect}
        aria-label="Foto oder PDF aus der Galerie wählen"
        data-testid="wizard-gallery-input"
      />

      {wizardOpen && (
        <ScanWizard
          step={wizardStep}
          doc={wizardDocument}
          uploadError={wizardUploadError}
          confirmedCount={confirmedCount}
          onCapture={handleWizardCapture}
          onUseGallery={handleWizardUseGallery}
          onCreateNote={handleWizardCreateNote}
          onRetryUpload={handleWizardRetryUpload}
          onClose={closeWizard}
          onReviewDone={handleWizardReviewDone}
          onScanNext={handleWizardScanNext}
          onRetake={handleWizardRetake}
        />
      )}

      <CreateNoteSheet
        open={createNoteOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateNote();
        }}
        onSubmit={handleCreateNote}
      />
    </>
  );
}
