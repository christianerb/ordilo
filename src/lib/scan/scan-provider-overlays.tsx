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

export function ScanProviderOverlays({
  expandedDocId,
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
}: Pick<
  ScanProviderState,
  | "expandedDocument"
  | "wizardDocument"
  | "wizardOpen"
  | "wizardStep"
  | "wizardUploadError"
  | "wizardGalleryInputRef"
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
> & { expandedDocId: string | null }) {
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
          onCapture={handleWizardCapture}
          onUseGallery={handleWizardUseGallery}
          onRetryUpload={handleWizardRetryUpload}
          onClose={closeWizard}
          onReviewDone={handleWizardReviewDone}
        />
      )}
    </>
  );
}
