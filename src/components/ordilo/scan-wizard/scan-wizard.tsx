"use client";

import { useRef } from "react";
import { X, RefreshCw } from "lucide-react";
import type { Database } from "@/types/database";
import { CameraStep } from "./camera-step";
import { ScanProcessingStep } from "./processing-step";
import { ScanReviewStep } from "./review-step";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export type ScanWizardStep = "camera" | "processing" | "review";

export interface ScanWizardProps {
  step: ScanWizardStep;
  /** The processing/review target document, once its row exists. */
  doc: DocumentRow | null;
  /** Upload-stage error (before a document row exists). */
  uploadError?: string | null;
  /** Number of already-confirmed documents (for milestone celebration). */
  confirmedCount?: number;
  onCapture: (file: File) => void;
  onUseGallery: () => void;
  onCreateNote?: () => void;
  onRetryUpload: () => void;
  onClose: () => void;
  onReviewDone: () => void;
  /** After confirm: reopen the camera for the next document (batch flow). */
  onScanNext: () => void;
  /** Discard the current document and re-capture (bad scan/photo). */
  onRetake: () => void;
}

/**
 * Scan Wizard — the full-screen overlay that replaces the old dropzone as
 * the main entry point into scanning: camera → processing → review.
 *
 * A thin shell around the three step components; all real state
 * (document polling, upload, OCR/analysis triggering) lives in the scan
 * page and is passed in, so the wizard has no logic of its own beyond
 * routing between steps and owning the overlay chrome (focus, Escape,
 * scroll lock).
 */
export function ScanWizard({
  step,
  doc,
  uploadError,
  confirmedCount = 0,
  onCapture,
  onUseGallery,
  onCreateNote,
  onRetryUpload,
  onClose,
  onReviewDone,
  onScanNext,
  onRetake,
}: ScanWizardProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Lock body scroll while the wizard is open.
  useMountEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  });

  // Escape closes the wizard. The underlying document (if any) keeps
  // whatever state it already reached server-side — closing never
  // discards work, it just returns to the regular document list.
  useMountEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div
      className="fixed inset-0 z-[60] bg-[var(--warm-white)]"
      role="dialog"
      aria-modal="true"
      aria-label="Dokument scannen"
      data-testid="scan-wizard"
    >
      {step === "camera" && (
        <CameraStep
          onCapture={onCapture}
          onUseGallery={onUseGallery}
          onCreateNote={onCreateNote}
          onClose={onClose}
        />
      )}

      {step === "processing" && (
        <ScanProcessingStep
          doc={doc}
          uploadError={uploadError}
          onRetry={onRetryUpload}
          onClose={onClose}
        />
      )}

      {step === "review" && doc && (
        <div className="flex size-full flex-col overflow-y-auto">
          <div
            className="mx-auto flex w-full max-w-md items-center justify-between p-4"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          >
            <button
              type="button"
              onClick={onRetake}
              className="inline-flex items-center gap-1.5 rounded-ordilo-sm text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Neu scannen — dieses Dokument verwerfen"
              data-testid="review-step-retake-button"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Neu scannen
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Schließen"
              data-testid="review-step-close-button"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 px-5 pb-10">
            <div className="mx-auto max-w-md lg:max-w-6xl">
              <ScanReviewStep
                documentId={doc.id}
                onDone={onReviewDone}
                onScanNext={onScanNext}
                confirmedCount={confirmedCount}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
