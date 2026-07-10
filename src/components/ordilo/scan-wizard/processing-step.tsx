"use client";

import { Check, Loader2, X, AlertCircle, ArrowRight } from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FAILED_CARD_COPY,
  PIPELINE_STEPS as STEPS,
  getPipelineStepsCompleted,
} from "@/lib/schemas/document";
import type { Database } from "@/types/database";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

/**
 * How many of the three steps are complete, based on the real document
 * status — never a fabricated/decorative progress value. Returns 0 while
 * the document row doesn't exist yet (upload request still in flight).
 */
function completedSteps(doc: DocumentRow | null): number {
  if (!doc) return 0;
  return getPipelineStepsCompleted(doc.status);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ScanProcessingStepProps {
  /** The uploaded document, once its row exists. Null while the upload
   * request itself is still in flight. */
  doc: DocumentRow | null;
  /** Error from the upload step itself (before a document row exists). */
  uploadError?: string | null;
  /** Retry the whole capture → upload flow (goes back to the camera). */
  onRetry: () => void;
  /** Close the wizard; processing continues in the background. */
  onClose: () => void;
}

/**
 * Processing Step — a calm, honest progress narration while the document
 * is uploaded, read (OCR), and understood (LLM analysis).
 *
 * Every checkmark reflects a real status transition already tracked by
 * the scan page's existing polling (`isProcessingStatus` + the 3s refetch
 * interval) — nothing here is a fake timer. The mascot's "thinking" mood
 * carries the waiting moment instead of a plain spinner.
 */
export function ScanProcessingStep({
  doc,
  uploadError,
  onRetry,
  onClose,
}: ScanProcessingStepProps) {
  const failed = Boolean(uploadError) || doc?.status === "failed";
  const done = completedSteps(doc);

  return (
    <div
      className="flex size-full flex-col bg-[var(--warm-white)]"
      data-testid="processing-step"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-end p-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Schließen"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16">
        {failed ? (
          <div className="flex max-w-xs flex-col items-center gap-3 text-center">
            <div
              className="flex size-14 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--destructive)" }}
            >
              <AlertCircle
                className="size-7 text-white"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Das hat nicht geklappt
            </h2>
            <p className="text-sm text-muted-foreground">
              {uploadError || `${FAILED_CARD_COPY}.`} Bitte nochmal versuchen.
            </p>
            <Button
              type="button"
              size="lg"
              onClick={onRetry}
              className="mt-2 h-11 rounded-ordilo-md"
              data-testid="processing-retry-button"
            >
              Nochmal versuchen
            </Button>
          </div>
        ) : (
          <>
            <OrdiloMascot
              size={56}
              mood="thinking"
              animate
              style={{ color: "var(--petrol)" }}
            />
            <h2 className="mt-4 text-base font-semibold text-foreground">
              Ordilo schaut sich das an …
            </h2>

            <div
              className="mt-6 w-full max-w-xs"
              data-testid="processing-checklist"
            >
              <ul className="space-y-0">
                {STEPS.map((step, i) => {
                  const stepDone = done > i;
                  const stepActive = done === i;
                  const isLast = i === STEPS.length - 1;
                  return (
                    <li
                      key={step.key}
                      className="flex items-start gap-3"
                      data-testid={`processing-step-${step.key}`}
                      data-state={stepDone ? "done" : stepActive ? "active" : "pending"}
                    >
                      {/* Step indicator + connecting line */}
                      <div className="flex shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full transition-colors duration-300",
                            stepDone
                              ? "bg-[var(--petrol)]"
                              : stepActive
                                ? "bg-[var(--petrol)]/10"
                                : "bg-[var(--sand-light)]",
                          )}
                          aria-hidden="true"
                        >
                          {stepDone ? (
                            <Check
                              className="size-3.5 text-white"
                              strokeWidth={2.5}
                            />
                          ) : stepActive ? (
                            <Loader2 className="size-3.5 animate-spin text-[var(--petrol)]" />
                          ) : null}
                        </span>
                        {/* Connecting line to next step */}
                        {!isLast && (
                          <span
                            className={cn(
                              "mt-1 h-7 w-px transition-colors duration-500",
                              stepDone
                                ? "bg-[var(--petrol)]"
                                : "bg-[var(--mist-light)]",
                            )}
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      {/* Label */}
                      <span
                        className={cn(
                          "pt-0.5 text-sm transition-colors duration-300",
                          stepDone || stepActive
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Background processing button */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onClose}
              className="mt-8 h-11 rounded-ordilo-md"
              data-testid="processing-background-button"
            >
              Im Hintergrund weiterlaufen
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
