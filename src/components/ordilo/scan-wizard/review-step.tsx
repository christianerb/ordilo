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
import { buildConfirmPayload, type EditState } from "@/components/ordilo/review-card/helpers";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { ReviewSummary } from "@/components/ordilo/review-summary";

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
  className?: string;
}

/**
 * Review Step — zero-touch by default.
 *
 * A CLEAN analysis (nothing flagged uncertain, no ambiguous person match)
 * files itself: an auto-file card announces where the document is going
 * and confirms automatically after {@link AUTO_CONFIRM_DELAY_MS} — the
 * user can intercept with "Bearbeiten" or fast-forward with "Fertig".
 * Closing the wizard during the countdown still confirms (flush on
 * unmount), so the document is never left half-filed by an impatient tap.
 *
 * An UNCLEAN analysis lands on the compact {@link ReviewSummary}
 * ("does this look right?") exactly as before; "Bearbeiten" hands off to
 * the full, field-by-field {@link ReviewCard}.
 */
export function ScanReviewStep({ documentId, onDone, className }: ScanReviewStepProps) {
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"auto" | "summary" | "edit">("summary");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;

  // Tracks the auto-confirm lifecycle across unmount: "pending" means the
  // countdown is still running and the confirm MUST be flushed if the
  // component disappears; anything else means it's handled.
  const autoConfirmRef = useRef<"idle" | "pending" | "handled">("idle");
  const analysisRef = useRef<DocumentAnalysis | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleConfirmRef = useRef<() => Promise<void>>(async () => {});

  useMountEffect(() => {
    let cancelled = false;
    async function load() {
      const [a, members] = await Promise.all([
        fetchDocumentAnalysis(documentIdRef.current),
        fetchFamilyMembers(),
      ]);
      if (cancelled) return;
      setAnalysis(a);
      analysisRef.current = a;
      setFamilyMembers(members);
      setLoading(false);

      // Zero-touch decision: a clean analysis files itself.
      const unresolved =
        a !== null &&
        a.family_members.some((m) => m.confidence < LOW_CONFIDENCE_THRESHOLD) &&
        members.length >= 2;
      if (a && !a.needs_user_review && !unresolved) {
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
      // Flush: the wizard closed mid-countdown. The document is clean —
      // file it anyway (fire-and-forget), so closing never loses the
      // zero-touch promise. Failures are safe: the document simply stays
      // "analyzed" and reappears under "Zum Durchsehen".
      if (autoConfirmRef.current === "pending" && analysisRef.current) {
        autoConfirmRef.current = "handled";
        const payload = buildConfirmPayload(analysisRef.current, EMPTY_EDITS);
        void fetch(`/api/documents/${documentIdRef.current}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});
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
      const response = await fetch(`/api/documents/${documentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
    const category = analysis.suggested_category?.trim();
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
              <span className="font-medium text-foreground">{analysis.title}</span>
              {category ? <> · landet in „{category}&ldquo;</> : null}
            </p>
          </div>

          {/* Countdown — a shrinking petrol bar; when it reaches zero the
              document confirms itself. Pure state-conveying motion. */}
          <div
            className="h-1 w-40 overflow-hidden rounded-full bg-[var(--sand-light)]"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-[var(--petrol)] motion-reduce:animate-none"
              style={{
                animation: `autofile-countdown ${AUTO_CONFIRM_DELAY_MS}ms linear forwards`,
              }}
              data-testid="autofile-countdown"
            />
          </div>
          <style>{`@keyframes autofile-countdown { from { width: 100%; } to { width: 0%; } }`}</style>
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
