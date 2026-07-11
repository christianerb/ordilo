import { useCallback, useState } from "react";
import Link from "next/link";
import { RefreshCw, AlertCircle, Loader2, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import {
  FAILED_CARD_COPY,
  PIPELINE_STEPS,
  getPipelineStepsCompleted,
} from "@/lib/schemas/document";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { ConfirmedAnalysisDetails } from "./confirmed-details";

/**
 * Skeleton loading state for the review card.
 */
export function ReviewCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-testid="review-card-skeleton"
      className={cn(
        "rounded-ordilo-md border border-border bg-card p-5 shadow-card",
        className,
      )}
    >
      <div className="space-y-3">
        <div className="h-6 w-3/4 animate-pulse rounded-md bg-accent" />
        <div className="h-4 w-1/2 animate-pulse rounded-md bg-accent" />
      </div>
      <div className="mt-4 space-y-3">
        <div className="h-20 animate-pulse rounded-ordilo-sm bg-accent" />
        <div className="h-20 animate-pulse rounded-ordilo-sm bg-accent" />
        <div className="h-20 animate-pulse rounded-ordilo-sm bg-accent" />
      </div>
      <div className="mt-5 space-y-2.5">
        <div className="h-12 w-full animate-pulse rounded-ordilo-md bg-accent" />
        <div className="h-12 w-full animate-pulse rounded-ordilo-md bg-accent" />
      </div>
    </div>
  );
}

/**
 * Processing state for the review card — shown while a document is still
 * moving through the upload → OCR → analysis pipeline (statuses
 * "uploaded", "ocr_processing", "ocr_done"), before there's anything to
 * review yet.
 *
 * Every document card is clickable regardless of status (VAL-SCAN-041):
 * previously, cards in these early statuses had no onClick handler at
 * all, so tapping them did nothing — visually identical to a reviewable
 * card, but silently inert. This state gives an honest, real-progress
 * checklist (same steps/labels as the full-screen scan wizard) so every
 * tap on a document card now shows something.
 */
export function ReviewCardProcessing({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const done = getPipelineStepsCompleted(status);

  return (
    <div
      data-testid="review-card-processing"
      className={cn(
        "rounded-ordilo-md border border-border bg-card p-5 shadow-card",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center">
        <OrdiloMascot size={40} mood="thinking" style={{ color: "var(--petrol)" }} />
        <h3 className="mt-3 text-base font-semibold text-foreground">
          Ordilo schaut sich das an …
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Das dauert nur einen Moment.
        </p>
      </div>

      <ul className="mt-4 space-y-2.5">
        {PIPELINE_STEPS.map((step, i) => {
          const stepDone = done > i;
          const stepActive = done === i;
          return (
            <li
              key={step.key}
              className="flex items-center gap-2.5"
              data-testid={`review-processing-step-${step.key}`}
              data-state={stepDone ? "done" : stepActive ? "active" : "pending"}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  stepDone
                    ? "bg-[var(--petrol)]"
                    : stepActive
                      ? "bg-[var(--petrol)]/10"
                      : "bg-[var(--sand-light)]",
                )}
                aria-hidden="true"
              >
                {stepDone ? (
                  <Check className="size-3 text-white" strokeWidth={2.5} />
                ) : stepActive ? (
                  <Loader2 className="size-3 animate-spin text-[var(--petrol)]" />
                ) : null}
              </span>
              <span
                className={cn(
                  "text-sm",
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
  );
}

/**
 * Friendly, user-safe German copy shown for any failed-analysis card.
 *
 * The raw backend/provider error (e.g. "OpenAI: API-Fehler",
 * "Could not parse PDF") is never surfaced to the user. Provider-specific
 * details are kept out of the UI (VAL-REVIEW-014). This uses the shared
 * `FAILED_CARD_COPY` constant from the document schema module so the
 * collapsed DocumentCard row and the expanded ReviewCard show the same
 * friendly German failed-state copy.
 */

/**
 * Error state for the review card.
 *
 * Always renders the same friendly German copy regardless of the
 * underlying provider/backend error, so no raw error text leaks into
 * the UI (VAL-REVIEW-014). The `errorMessage` prop is accepted for API
 * compatibility but is intentionally not displayed.
 */
export function ReviewCardError({
  onRetry,
  className,
}: {
  errorMessage?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="review-card-error"
      className={cn(
        "rounded-ordilo-md border border-destructive/20 bg-destructive/5 p-5 shadow-card",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center">
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--destructive)" }}
        >
          <AlertCircle
            className="size-6 text-white"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <h3 className="mt-3 text-base font-semibold text-foreground">
          Das hat nicht geklappt
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {FAILED_CARD_COPY}. Bitte nochmal versuchen.
        </p>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onRetry}
            className="mt-4 h-11 rounded-ordilo-md"
            data-testid="review-retry-button"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Nochmal versuchen
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmed state for the review card.
 *
 * Shows a success message and a "Neu analysieren" (re-analyze) button so
 * the user can re-run extraction from the confirmed state
 * (VAL-EXTRACT-012). The re-analyze action calls the analyze route which
 * resets the document status to `analyzed` and clears prior results.
 */
export function ReviewCardConfirmed({
  documentId,
  analysis = null,
  analysisLoading = false,
  celebrate = false,
  askTitle = null,
  onReanalyze,
  reanalyzing = false,
  className,
}: {
  /** The document ID — used to fetch a signed URL for "Original ansehen". */
  documentId?: string;
  /**
   * The reconstructed analysis for this (already confirmed) document, so
   * its metadata — persons, dates, amounts, tags, category — is actually
   * visible here instead of just a static success message.
   */
  analysis?: DocumentAnalysis | null;
  /** True while the analysis is being fetched. */
  analysisLoading?: boolean;
  /**
   * True for the one moment this actually happened — right after the
   * user's own "Alles bestätigen" action. Plays the mascot's celebration
   * (wave + hop). False when simply revisiting an already-confirmed
   * document, where the same celebration would feel repetitive rather
   * than earned (see impeccable delight guidance: "still pleasant after
   * the 100th time?").
   */
  celebrate?: boolean;
  /**
   * Document title for the "Frag Ordilo dazu" follow-up CTA — the reward
   * moment right after confirming. Links to /suche with a prefilled,
   * auto-submitting question about this document, closing the loop from
   * "added" to "asked". Null hides the CTA (e.g. when revisiting).
   */
  askTitle?: string | null;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  className?: string;
}) {
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleViewFile = useCallback(async () => {
    if (!documentId || fileLoading) return;
    setFileLoading(true);
    setFileError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/file`);
      if (!response.ok) {
        throw new Error();
      }
      const { url } = (await response.json()) as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setFileError("Datei konnte nicht geöffnet werden.");
    } finally {
      setFileLoading(false);
    }
  }, [documentId, fileLoading]);

  return (
    <div
      data-testid="review-card-confirmed"
      className={cn(
        "rounded-ordilo-md border border-[var(--petrol)]/20 bg-[var(--petrol)]/5 p-5 shadow-card",
        celebrate && "animate-card-in",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center">
        <div
          className="flex size-14 items-center justify-center rounded-full bg-[var(--petrol)]/10"
          aria-hidden="true"
        >
          <OrdiloMascot
            size={40}
            mood={celebrate ? "success" : "idle"}
            animate={celebrate}
            style={{ color: "var(--petrol)" }}
          />
        </div>
        <h3 className="mt-3 text-base font-semibold text-foreground">
          Im Familienbuch
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ist im Familienbuch und kann durchsucht werden.
        </p>
        {askTitle && (
          <Button
            asChild
            size="lg"
            className="mt-4 h-11 w-full rounded-ordilo-md sm:w-auto"
            data-testid="confirmed-ask-button"
          >
            <Link
              href={`/suche?q=${encodeURIComponent(`Was steht in „${askTitle}“?`)}`}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Frag Ordilo dazu
            </Link>
          </Button>
        )}
        {onReanalyze && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onReanalyze}
            disabled={reanalyzing}
            className="mt-4 h-11 rounded-ordilo-md"
            data-testid="confirmed-reanalyze-button"
          >
            {reanalyzing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                wird nochmal gelesen …
              </>
            ) : (
              <>
                <RefreshCw className="size-4" aria-hidden="true" />
                Nochmal lesen
              </>
            )}
          </Button>
        )}
        {fileError && (
          <p className="mt-2 text-sm text-destructive">{fileError}</p>
        )}
      </div>

      <ConfirmedAnalysisDetails
        analysis={analysis}
        loading={analysisLoading}
        onViewFile={documentId ? handleViewFile : undefined}
        fileLoading={fileLoading}
      />
    </div>
  );
}
