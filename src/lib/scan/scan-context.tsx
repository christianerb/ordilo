"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ScanProviderOverlays } from "@/lib/scan/scan-provider-overlays";
import type {
  DocumentViewerValue,
  ScanActionsValue,
  ScanContextValue,
} from "@/lib/scan/scan-context-types";
import { useScanProviderState } from "@/lib/scan/use-scan-provider-state";

const ScanContext = createContext<ScanContextValue | null>(null);
const ScanActionsContext = createContext<ScanActionsValue | null>(null);
const DocumentViewerContext = createContext<DocumentViewerValue | null>(null);

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error("useScan must be used within a ScanProvider");
  }
  return ctx;
}

export function useScanActions(): ScanActionsValue {
  const ctx = useContext(ScanActionsContext);
  if (!ctx) {
    throw new Error("useScanActions must be used within a ScanProvider");
  }
  return ctx;
}

export function useDocumentViewer(): DocumentViewerValue {
  const ctx = useContext(DocumentViewerContext);
  if (!ctx) {
    throw new Error("useDocumentViewer must be used within a ScanProvider");
  }
  return ctx;
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const state = useScanProviderState();

  return (
    <ScanActionsContext.Provider value={state.scanActionsValue}>
      <DocumentViewerContext.Provider value={state.documentViewerValue}>
        <ScanContext.Provider value={state.value}>
          {children}
          <ScanProviderOverlays
            expandedDocId={state.value.expandedDocId}
            expandedDocument={state.expandedDocument}
            wizardDocument={state.wizardDocument}
            wizardOpen={state.wizardOpen}
            wizardStep={state.wizardStep}
            wizardUploadError={state.wizardUploadError}
            wizardGalleryInputRef={state.wizardGalleryInputRef}
            createNoteOpen={state.createNoteOpen}
            closeDocument={state.closeDocument}
            closeWizard={state.closeWizard}
            handleConfirmSuccess={state.handleConfirmSuccess}
            handleReanalyzeSuccess={state.handleReanalyzeSuccess}
            handleRetryFailed={state.handleRetryFailed}
            handleWizardCapture={state.handleWizardCapture}
            handleWizardUseGallery={state.handleWizardUseGallery}
            handleWizardRetryUpload={state.handleWizardRetryUpload}
            handleWizardGallerySelect={state.handleWizardGallerySelect}
            handleWizardReviewDone={state.handleWizardReviewDone}
            handleWizardCreateNote={state.handleWizardCreateNote}
            closeCreateNote={state.closeCreateNote}
            handleCreateNote={state.handleCreateNote}
          />
        </ScanContext.Provider>
      </DocumentViewerContext.Provider>
    </ScanActionsContext.Provider>
  );
}
