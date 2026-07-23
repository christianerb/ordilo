"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, FolderCheck, Pencil, Camera, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/schemas/extraction";
import { formatGermanDate } from "@/lib/format";
import type { FamilyMemberOption } from "@/lib/analysis";
import { fetchDocumentAnalysis, fetchFamilyMembers } from "@/lib/analysis";
import { ReviewCard } from "@/components/ordilo/review-card";
import { ReviewCardSkeleton } from "@/components/ordilo/review-card/states";
import { OriginalDocumentPreview } from "@/components/ordilo/original-document-preview";
import {
  buildConfirmPayload,
  postConfirm,
  type EditState,
} from "@/components/ordilo/review-card/helpers";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { ReviewSummary } from "@/components/ordilo/review-summary";
import { cn } from "@/lib/utils";

const EMPTY_EDITS: EditState = {
  persons: new Map(),
  factValues: new Map(),
  category: null,
  dates: new Map(),
  organizationNames: new Map(),
  amountValues: new Map(),
  taskTitles: new Map(),
  taskPriorities: new Map(),
  taskDueDates: new Map(),
  deletedTasks: new Set(),
};

/** Build the ready-to-save action list inline (was previously imported). */
function buildAutoActions(analysis: DocumentAnalysis): string[] {
  const actions: string[] = [];
  const topPerson = analysis.family_members[0];
  actions.push(
    topPerson
      ? `Dokument bei ${topPerson.name} speichern`
      : "Dokument im Familienbuch speichern",
  );
  if (analysis.tasks.length === 1) {
    actions.push(`Aufgabe "${analysis.tasks[0].title}" erstellen`);
  } else if (analysis.tasks.length > 1) {
    actions.push(`${analysis.tasks.length} Aufgaben erstellen`);
  }
  const dueDates = analysis.tasks
    .map((t) => t.due_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dueDates[0]) {
    const formatted = formatGermanDate(dueDates[0]) || dueDates[0];
    actions.push(`Erinnerung am ${formatted}`);
  }
  if (analysis.suggested_category && analysis.suggested_category.trim()) {
    actions.push(`In „${analysis.suggested_category}" einsortieren`);
  }
  return actions;
}

export interface ScanReviewStepProps {
  documentId: string;
  onDone: () => void;
  /** After confirm: reopen the camera for the next document (batch flow). */
  onScanNext?: () => void;
  /** Number of already-confirmed documents before this one (for milestones). */
  confirmedCount?: number;
  className?: string;
}

/**
 * Review Step — unhurried confirmation.
 *
 * A CLEAN analysis gets a compact ready-to-save card. It stays visible
 * until the user chooses to save or edit it.
 *
 * An UNCLEAN analysis lands on the compact ReviewSummary with inline
 * person editing and "Bearbeiten" for everything else.
 */
export function ScanReviewStep({
  documentId,
  onDone,
  onScanNext,
  confirmedCount = 0,
  className,
}: ScanReviewStepProps) {
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"auto" | "summary" | "edit">("summary");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [edits, setEdits] = useState<EditState>(EMPTY_EDITS);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [originalPreviewOpen, setOriginalPreviewOpen] = useState(false);

  const cancelledRef = useRef(false);

  // Load the analysis + family members. Previously a failed/empty fetch
  // (network blip, replica lag) left the skeleton on screen forever with
  // nothing tappable — now it lands in an explicit error state with retry.
  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const [a, members] = await Promise.all([
        fetchDocumentAnalysis(documentId),
        fetchFamilyMembers(),
      ]);
      if (cancelledRef.current) return;
      setAnalysis(a);
      setFamilyMembers(members);

      if (a && !a.needs_user_review) {
        setMode("auto");
      }
    } catch {
      if (cancelledRef.current) return;
      setAnalysis(null);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [documentId]);

  useMountEffect(() => {
    cancelledRef.current = false;
    void loadAnalysis();
    return () => {
      cancelledRef.current = true;
    };
  });

  const hasUnresolvedDisambiguation = useMemo(() => {
    if (!analysis) return false;
    const lowConfidenceCount = analysis.family_members.filter(
      (member, index) =>
        member.confidence < LOW_CONFIDENCE_THRESHOLD &&
        !edits.persons.has(index),
    ).length;
    return lowConfidenceCount > 0 && familyMembers.length >= 2;
  }, [analysis, edits.persons, familyMembers]);

  const handleConfirm = useCallback(async () => {
    if (!analysis || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const payload = buildConfirmPayload(analysis, edits);
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
    } finally {
      setConfirming(false);
    }
  }, [analysis, confirming, documentId, edits]);
  const handleEditPerson = useCallback((memberId: string | null) => {
    const member = familyMembers.find((m) => m.id === memberId);
    setEdits((prev) => {
      const newPersons = new Map(prev.persons);
      if (member) {
        newPersons.set(0, { name: member.name, personId: member.id });
      } else {
        newPersons.delete(0);
      }
      return { ...prev, persons: newPersons };
    });
  }, [familyMembers]);

  const handleReanalyze = useCallback(async () => {
    if (reanalyzing) return;
    setReanalyzing(true);
    setConfirmError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/analyze`, {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      // Reload analysis after re-analysis
      const result = await fetchDocumentAnalysis(documentId);
      setAnalysis(result);
      setEdits(EMPTY_EDITS);
    } catch {
      setConfirmError("Nochmal lesen hat nicht geklappt.");
    } finally {
      setReanalyzing(false);
    }
  }, [documentId, reanalyzing]);

  const editedPersonId = edits.persons.get(0)?.personId ?? null;

  // --- Milestone celebration ---
  // After this confirm, the total confirmed count becomes confirmedCount + 1.
  // We celebrate at 1 (first!), 10, 25, 50, and 100 — warm, not flashy.
  const MILESTONES: Record<number, string> = {
    1: "Das erste Dokument im Familienbuch — ein guter Anfang.",
    10: "Zehn Dokumente im Familienbuch. Langsam wird es übersichtlich.",
    25: "25 Dokumente — euer Familienbuch wächst schön mit.",
    50: "50 Dokumente im Familienbuch. Halbweg zu einem vollen Archiv.",
    100: "100 Dokumente! Ordilo kennt eure Akten besser als jeder Aktenordner.",
  };
  const afterCount = confirmedCount + 1;
  const milestoneMessage = MILESTONES[afterCount];

  // --- Simple confirmed state — just success + done ---
  if (confirmed) {
    return (
      <div
        className={cn("flex flex-col items-center gap-6 pt-10 text-center animate-card-in", className)}
        data-testid="review-step-confirmed"
      >
        <div
          className="flex size-16 items-center justify-center rounded-full bg-[var(--petrol)]/10"
          aria-hidden="true"
        >
          <OrdiloMascot
            size={48}
            mood="success"
            animate
            style={{ color: "var(--petrol)" }}
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Im Familienbuch
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {milestoneMessage ?? analysis?.title ?? "Dokument gespeichert."}
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <Button
            type="button"
            size="lg"
            onClick={onDone}
            className="h-12 w-full max-w-xs rounded-ordilo-md"
            data-testid="review-step-done-button"
          >
            <Check className="size-4" aria-hidden="true" />
            Fertig
          </Button>
          {onScanNext && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onScanNext}
              className="h-12 w-full max-w-xs rounded-ordilo-md"
              data-testid="review-step-scan-next-button"
            >
              <Camera className="size-4" aria-hidden="true" />
              Nächstes scannen
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return <ReviewCardSkeleton className={className} />;
  }

  if (!analysis) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-3 pt-10 text-center",
          className,
        )}
        data-testid="review-step-load-error"
      >
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
          Das Ergebnis konnte nicht geladen werden
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Bitte Verbindung überprüfen und nochmal versuchen — das Dokument
          selbst ist sicher gespeichert.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={() => void loadAnalysis()}
          className="mt-2 h-11 rounded-ordilo-md"
          data-testid="review-step-load-retry-button"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Nochmal versuchen
        </Button>
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <ReviewCard
        documentId={documentId}
        status="analyzed"
        onConfirmSuccess={() => setConfirmed(true)}
        onBack={(reviewEdits) => {
          setEdits(reviewEdits);
          setMode("summary");
        }}
        className={className}
      />
    );
  }

  if (mode === "auto") {
    const autoActions = buildAutoActions(analysis);
    return (
      <div
        className={cn(
          "lg:grid lg:items-start lg:gap-6",
          originalPreviewOpen &&
            "lg:grid-cols-[minmax(0,26rem)_minmax(28rem,1fr)]",
          className,
        )}
        data-testid="review-step-autofile"
      >
        {/* Original preview — mounted eagerly so the signed URL is
            prefetched; on mobile it stacks above the recognized fields
            (order-first) for a true side-by-side comparison, on desktop
            it sits in the second grid column (lg:order-2). */}
        <div className={cn("order-first lg:order-2", !originalPreviewOpen && "lg:hidden")}>
          <OriginalDocumentPreview
            documentId={documentId}
            title={analysis.title}
            open={originalPreviewOpen}
            onOpenChange={setOriginalPreviewOpen}
          />
        </div>
        <div className={cn("lg:order-1", !originalPreviewOpen && "mx-auto w-full max-w-md")}>
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
                Alles vorbereitet
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {analysis.title}
              </p>
            </div>

            <ul className="w-full max-w-xs space-y-1.5 text-left" data-testid="autofile-actions">
              {autoActions.map((action, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-foreground">
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]/10"
                    aria-hidden="true"
                  >
                    <Check className="size-3" style={{ color: "var(--petrol)" }} strokeWidth={2.5} />
                  </span>
                  {action}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOriginalPreviewOpen(true)}
              className="rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="autofile-view-original"
            >
              Original vergleichen
            </button>
          </div>

          {confirmError && (
            <div className="mt-4 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{confirmError}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2.5">
            <Button
              type="button"
              size="lg"
              disabled={confirming}
              onClick={() => {
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
      </div>
    );
  }

  return (
    <div
      className={cn(
        "lg:grid lg:items-start lg:gap-6",
        originalPreviewOpen &&
          "lg:grid-cols-[minmax(0,26rem)_minmax(28rem,1fr)]",
      )}
    >
      <div className={cn("order-first lg:order-2", !originalPreviewOpen && "lg:hidden")}>
        <OriginalDocumentPreview
          documentId={documentId}
          title={analysis.title}
          open={originalPreviewOpen}
          onOpenChange={setOriginalPreviewOpen}
        />
      </div>
      <ReviewSummary
        analysis={analysis}
        familyMembers={familyMembers}
        hasUnresolvedDisambiguation={hasUnresolvedDisambiguation}
        confirming={confirming}
        confirmError={confirmError}
        onConfirm={handleConfirm}
        onEdit={() => setMode("edit")}
        onReanalyze={handleReanalyze}
        onEditPerson={handleEditPerson}
        editedPersonId={editedPersonId}
        documentId={documentId}
        onViewOriginal={() => setOriginalPreviewOpen(true)}
        className={cn("lg:order-1", !originalPreviewOpen && "mx-auto max-w-md", className)}
      />
    </div>
  );
}
