"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
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
  category: null,
  dates: new Map(),
  taskDueDates: new Map(),
  deletedTasks: new Set(),
};

export interface ScanReviewStepProps {
  documentId: string;
  /** Called once the document has been confirmed and the celebration has
   * been shown — the wizard closes and the underlying document list is
   * already up to date. */
  onDone: () => void;
  className?: string;
}

/**
 * Review Step — lands on a compact, non-editable {@link ReviewSummary} by
 * default ("does this look right?"); "Bearbeiten" hands off to the full,
 * field-by-field {@link ReviewCard} for anyone who wants to correct
 * something before confirming.
 *
 * Fetches its own copy of the analysis for the summary view. Switching to
 * "Bearbeiten" lets the full Review Card do its own independent fetch —
 * a small, deliberate duplication that keeps the mature, well-tested
 * Review Card untouched rather than threading its internal state out.
 */
export function ScanReviewStep({ documentId, onDone, className }: ScanReviewStepProps) {
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"summary" | "edit">("summary");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;

  useMountEffect(() => {
    let cancelled = false;
    async function load() {
      const [a, members] = await Promise.all([
        fetchDocumentAnalysis(documentIdRef.current),
        fetchFamilyMembers(),
      ]);
      if (cancelled) return;
      setAnalysis(a);
      setFamilyMembers(members);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
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
    } finally {
      setConfirming(false);
    }
  }, [analysis, confirming, documentId]);

  if (confirmed) {
    return (
      <div className={className} data-testid="review-step-confirmed">
        <ReviewCardConfirmed celebrate />
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
