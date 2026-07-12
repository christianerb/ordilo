"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, FolderCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/schemas/extraction";
import type { FamilyMemberOption } from "@/lib/analysis";
import { fetchDocumentAnalysis, fetchFamilyMembers } from "@/lib/analysis";
import { ReviewCard } from "@/components/ordilo/review-card";
import { ReviewCardSkeleton, ReviewCardConfirmed } from "@/components/ordilo/review-card/states";
import {
  buildConfirmPayload,
  postConfirm,
  type EditState,
  type EditedAnalysisPayload,
} from "@/components/ordilo/review-card/helpers";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { ReviewSummary, buildAutoActions } from "@/components/ordilo/review-summary";

const EMPTY_EDITS: EditState = {
  persons: new Map(),
  factValues: new Map(),
  category: null,
  dates: new Map(),
  taskDueDates: new Map(),
  deletedTasks: new Set(),
};

/**
 * How long the auto-file card stays interceptable before the clean
 * document confirms itself. Long enough to read the card and tap
 * "Bearbeiten", short enough that the default path needs zero actions.
 */
export const AUTO_CONFIRM_DELAY_MS = 4000;

export interface ScanReviewStepProps {
  documentId: string;
  /** Called once the document has been confirmed and the celebration has
   * been shown — the wizard closes and the underlying document list is
   * already up to date. */
  onDone: () => void;
  /**
   * Called when the component unmounts while a zero-touch countdown is
   * still pending (the wizard was closed mid-countdown). The OWNER (scan
   * provider) performs the confirm and refreshes the document list, so
   * the UI never shows an already-confirmed document as reviewable.
   */
  onPendingAutoConfirm?: (
    documentId: string,
    payload: EditedAnalysisPayload,
  ) => void;
  className?: string;
}

/**
 * Review Step — zero-touch by default.
 *
 * A CLEAN analysis files itself: an auto-file card announces where the
 * document is going, lists exactly what confirming will do (including
 * tasks about to be created), and confirms automatically after
 * {@link AUTO_CONFIRM_DELAY_MS} — the user can intercept with
 * "Bearbeiten" or fast-forward with "Passt so". Closing the wizard
 * during the countdown still confirms via {@link onPendingAutoConfirm}.
 *
 * "Clean" means `needs_user_review === false`. That flag is
 * deterministic: `computeNeedsUserReview` (applied on every analysis
 * fetch) folds in EVERY low-confidence entity — persons included — so an
 * ambiguous person match can never reach the auto-file path.
 *
 * An UNCLEAN analysis lands on the compact {@link ReviewSummary}
 * ("does this look right?") exactly as before; "Bearbeiten" hands off to
 * the full, field-by-field {@link ReviewCard}.
 */
export function ScanReviewStep({
  documentId,
  onDone,
  onPendingAutoConfirm,
  className,
}: ScanReviewStepProps) {
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"auto" | "summary" | "edit">("summary");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const onPendingAutoConfirmRef = useRef(onPendingAutoConfirm);
  onPendingAutoConfirmRef.current = onPendingAutoConfirm;

  // Tracks the auto-confirm lifecycle across unmount: "pending" means the
  // countdown is still running and the confirm MUST be flushed if the
  // component disappears; anything else means it's handled.
  const autoConfirmRef = useRef<"idle" | "pending" | "handled">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleConfirmRef = useRef<() => Promise<void>>(async () => {});

  useMountEffect(() => {
    let cancelled = false;
    // Captured for the unmount flush so it can build the payload without
    // depending on state that may not have flushed yet.
    let loadedAnalysis: DocumentAnalysis | null = null;

    async function load() {
      const [a, members] = await Promise.all([
        fetchDocumentAnalysis(documentIdRef.current),
        fetchFamilyMembers(),
      ]);
      if (cancelled) return;
      setAnalysis(a);
      loadedAnalysis = a;
      setFamilyMembers(members);
      setLoading(false);

      // Zero-touch decision — see the component docstring for why
      // needs_user_review alone is a sufficient gate.
      if (a && !a.needs_user_review) {
        setMode("auto");
        autoConfirmRef.current = "pending";
        timerRef.current = setTimeout(() => {
          if (autoConfirmRef.current !== "pending") return;
          autoConfirmRef.current = "handled";
          void handleConfirmRef.current();
        }, AUTO_CONFIRM_DELAY_MS);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      // The wizard closed mid-countdown: hand the pending confirm to the
      // owner, which POSTs it and refreshes the document list. Failures
      // are safe — the document simply stays "analyzed" and reappears
      // under "Zum Durchsehen".
      if (autoConfirmRef.current === "pending" && loadedAnalysis) {
        autoConfirmRef.current = "handled";
        const payload = buildConfirmPayload(loadedAnalysis, EMPTY_EDITS);
        if (onPendingAutoConfirmRef.current) {
          onPendingAutoConfirmRef.current(documentIdRef.current, payload);
        } else {
          void postConfirm(documentIdRef.current, payload).catch(() => {});
        }
      }
    };
  });

  const hasUnresolvedDisambiguation = useMemo(() => {
    if (!analysis) return false;
    const lowConfidenceCount = analysis.family_members.filter(
      (m) => m.confidence < LOW_CONFIDENCE_THRESHOLD,
    ).length;
    return lowConfidenceCount > 0 && familyMembers.length >= 2;
  }, [analysis, familyMembers]);

  const handleConfirm = useCallback(async () => {
    if (!analysis || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const payload = buildConfirmPayload(analysis, EMPTY_EDITS);
      const response = await postConfirm(documentId, payload);
      if (!response.ok) {
        let errorBody: { error?: string };
        try {
          errorBody = await response.json();
        } catch {
          errorBody = {};
        }
        throw new Error(
          errorBody.error || "Bestätigen hat nicht geklappt. Bitte nochmal versuchen.",
        );
      }
      setConfirmed(true);
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : "Bestätigung fehlgeschlagen. Bitte erneut versuchen.",
      );
      // Auto-file failed — fall back to the manual summary so the user
      // sees the error and can retry deliberately.
      setMode("summary");
    } finally {
      setConfirming(false);
    }
  }, [analysis, confirming, documentId]);
  handleConfirmRef.current = handleConfirm;

  /** User intercepts the countdown — cancel and hand off. */
  const cancelAutoConfirm = useCallback(() => {
    autoConfirmRef.current = "handled";
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  if (confirmed) {
    return (
      <div className={className} data-testid="review-step-confirmed">
        <ReviewCardConfirmed celebrate askTitle={analysis?.title ?? null} />
        <Button
          type="button"
          size="lg"
          onClick={onDone}
          className="mt-4 h-12 w-full rounded-ordilo-md"
          data-testid="review-step-done-button"
        >
          <Check className="size-4" aria-hidden="true" />
          Fertig
        </Button>
      </div>
    );
  }

  if (loading || !analysis) {
    return <ReviewCardSkeleton className={className} />;
  }

  if (mode === "edit") {
    return (
      <ReviewCard
        documentId={documentId}
        status="analyzed"
        // Give the full Review Card's own confirmed celebration a moment
        // to play before the wizard closes, instead of cutting it off.
        onConfirmSuccess={() => setTimeout(onDone, 1500)}
        className={className}
      />
    );
  }

  if (mode === "auto") {
    const autoActions = buildAutoActions(analysis);
    return (
      <div
        className={className}
        data-testid="review-step-autofile"
      >
        <div className="flex flex-col items-center gap-4 pt-6 text-center animate-card-in">
          <div className="flex size-14 items-center justify-center rounded-full bg-[var(--petrol)]/10 animate-check-pop">
            <FolderCheck
              className="size-7"
              style={{ color: "var(--petrol)" }}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Sieht gut aus — Ordilo sortiert das ein
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {analysis.title}
            </p>
          </div>

          {/* Full transparency: exactly what confirming will do — the
              same list ReviewSummary shows, so tasks are never created
              sight-unseen. */}
          <ul
            className="w-full max-w-xs space-y-1.5 text-left"
            data-testid="autofile-actions"
          >
            {autoActions.map((action, i) => (
              <li
                key={i}
                className="flex items-center gap-2.5 text-sm text-foreground"
              >
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]/10"
                  aria-hidden="true"
                >
                  <Check
                    className="size-3"
                    style={{ color: "var(--petrol)" }}
                    strokeWidth={2.5}
                  />
                </span>
                {action}
              </li>
            ))}
          </ul>

          {/* Countdown — a shrinking petrol bar; when it reaches zero the
              document confirms itself. The animation lives in a class so
              the prefers-reduced-motion override can actually win (an
              inline style would beat every stylesheet rule). */}
          <div
            className="h-1 w-40 overflow-hidden rounded-full bg-[var(--sand-light)]"
            aria-hidden="true"
          >
            <div
              className="autofile-countdown-bar h-full rounded-full bg-[var(--petrol)]"
              data-testid="autofile-countdown"
            />
          </div>
          <style>{`
            @keyframes autofile-countdown { from { width: 100%; } to { width: 0%; } }
            .autofile-countdown-bar { animation: autofile-countdown ${AUTO_CONFIRM_DELAY_MS}ms linear forwards; }
            @media (prefers-reduced-motion: reduce) {
              .autofile-countdown-bar { animation: none; width: 100%; }
            }
          `}</style>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            type="button"
            size="lg"
            disabled={confirming}
            onClick={() => {
              cancelAutoConfirm();
              void handleConfirm();
            }}
            className="h-12 w-full rounded-ordilo-md"
            data-testid="autofile-done-button"
          >
            <Check className="size-4" aria-hidden="true" />
            Passt so
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={confirming}
            onClick={() => {
              cancelAutoConfirm();
              setMode("edit");
            }}
            className="h-12 w-full rounded-ordilo-md"
            data-testid="autofile-edit-button"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Bearbeiten
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ReviewSummary
      analysis={analysis}
      familyMembers={familyMembers}
      hasUnresolvedDisambiguation={hasUnresolvedDisambiguation}
      confirming={confirming}
      confirmError={confirmError}
      onConfirm={handleConfirm}
      onEdit={() => setMode("edit")}
      className={className}
    />
  );
}
