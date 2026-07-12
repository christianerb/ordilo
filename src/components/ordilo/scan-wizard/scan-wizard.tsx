"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import type { Database } from "@/types/database";
import { CameraStep } from "./camera-step";
import { ScanProcessingStep } from "./processing-step";
import { ScanReviewStep } from "./review-step";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import type { EditedAnalysisPayload } from "@/components/ordilo/review-card/helpers";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export type ScanWizardStep = "camera" | "processing" | "review";

export interface ScanWizardProps {
  step: ScanWizardStep;
  /** The processing/review target document, once its row exists. */
  doc: DocumentRow | null;
  /** Upload-stage error (before a document row exists). */
  uploadError?: string | null;
  onCapture: (file: File) => void;
  onUseGallery: () => void;
  onCreateNote?: () => void;
  onRetryUpload: () => void;
  onClose: () => void;
  onReviewDone: () => void;
  /** Owner-side flush for a zero-touch confirm pending at wizard close. */
  onPendingAutoConfirm?: (
    documentId: string,
    payload: EditedAnalysisPayload,
  ) => void;
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
  onCapture,
  onUseGallery,
  onCreateNote,
  onRetryUpload,
  onClose,
  onReviewDone,
  onPendingAutoConfirm,
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
            className="flex items-center justify-end p-4"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          >
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
            <ScanReviewStep
              documentId={doc.id}
              onDone={onReviewDone}
              onPendingAutoConfirm={onPendingAutoConfirm}
            />
          </div>
        </div>
      )}
    </div>
  );
}
