"use client";

import { useCallback, useMemo, useState } from "react";
import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/schemas/extraction";
import type { FamilyMemberOption } from "@/lib/analysis";
import {
  fetchDocumentAnalysis,
  fetchFamilyMembers,
  fetchExistingCategories,
} from "@/lib/analysis";
import { ReviewCardContent } from "./content";
import {
  ReviewCardSkeleton,
  ReviewCardError,
  ReviewCardConfirmed,
  ReviewCardProcessing,
} from "./states";
import { buildConfirmPayload } from "./helpers";
import type { EditState, EditedAnalysisPayload } from "./helpers";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

// Re-export public types so that imports from "@/components/ordilo/review-card"
// continue to resolve.
export type { EditedAnalysisPayload };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the ReviewCard component.
 */
export interface ReviewCardProps {
  /** The document ID. */
  documentId: string;
  /** The current document status. */
  status: string;
  /** Error message when status is "failed". */
  errorMessage?: string | null;
  /** Called after a successful confirm to notify the parent to refresh. */
  onConfirmSuccess?: () => void;
  /** Called after a successful re-analyze to notify the parent to refresh. */
  onReanalyzeSuccess?: () => void;
  /** Called after a retry to notify the parent to refresh. */
  onRetry?: () => void;
  /** Optional additional className. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence threshold for showing the disambiguation prompt. */
const DISAMBIGUATION_THRESHOLD = LOW_CONFIDENCE_THRESHOLD;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Review Card — displays the AI's analysis of a document with
 * confidence badges, edit flows, confirm, and re-analyze actions.
 *
 * Renders different states based on the document status:
 *   - `uploaded` / `ocr_processing` / `ocr_done`: Honest pipeline
 *     checklist (nothing to review yet)
 *   - `analyzing`: Skeleton loading state with disabled controls
 *   - `analyzed`: Full review card with all fields, edit flows, confirm
 *   - `failed`: Friendly error with retry
 *   - `confirmed`: Success state
 *
 * Features:
 * - All extracted fields with confidence badges
 * - Edit person (dropdown of family members)
 * - Edit category (existing + free-text)
 * - Edit deadline/date (date picker)
 * - Delete task (removes from card, excludes from confirm)
 * - "Alles bestätigen" button (enabled when analyzed)
 * - "Neu analysieren" (re-analyze) button
 * - Low-confidence disambiguation prompt
 * - needs_user_review visual emphasis (badge/highlight)
 * - Empty/partial extraction renders gracefully
 * - Edited entities visually marked ("bearbeitet")
 */
export function ReviewCard({
  documentId,
  status,
  errorMessage,
  onConfirmSuccess,
  onReanalyzeSuccess,
  onRetry,
  className,
}: ReviewCardProps) {
  // --- State ---
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberOption[]>([]);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [edits, setEdits] = useState<EditState>({
    persons: new Map(),
    factValues: new Map(),
    category: null,
    dates: new Map(),
    taskDueDates: new Map(),
    deletedTasks: new Set(),
  });
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // --- Fetch family members and categories on mount ---
  useMountEffect(() => {
    let cancelled = false;
    async function loadContext() {
      const [members, categories] = await Promise.all([
        fetchFamilyMembers(),
        fetchExistingCategories(),
      ]);
      if (cancelled) return;
      setFamilyMembers(members);
      setExistingCategories(categories);
    }
    loadContext();
    return () => {
      cancelled = true;
    };
  });

  // --- Fetch analysis when there's analysis data to show ---
  // "confirmed" is included alongside "analyzed" so a document that's
  // already in the family book still shows its actual metadata (persons,
  // dates, tags, …) instead of just a static success message.
  const loadAnalysis = useCallback(async () => {
    if (status !== "analyzed" && status !== "confirmed") {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchDocumentAnalysis(documentId);
    setAnalysis(result);
    setLoading(false);
  }, [documentId, status]);

  // Note: This loads analysis once on mount using the initial documentId
  // and status. If the parent changes documentId, it should use a `key`
  // prop to force a remount so the analysis reloads.
  useMountEffect(() => {
    loadAnalysis();
  });

  // --- Derived: check if needs_user_review ---
  const needsReview = analysis?.needs_user_review ?? false;

  // --- Derived: low-confidence persons for disambiguation ---
  const lowConfidencePersons = useMemo(() => {
    if (!analysis) return [];
    return analysis.family_members
      .map((m, i) => ({ member: m, index: i }))
      .filter(
        ({ member }) =>
          member.confidence < DISAMBIGUATION_THRESHOLD &&
          !edits.persons.has(
            analysis.family_members.indexOf(member),
          ),
      );
  }, [analysis, edits.persons]);

  const hasUnresolvedDisambiguation =
    lowConfidencePersons.length > 0 && familyMembers.length >= 2;

  // --- Handlers ---

  /** Edit person: select a family member from the dropdown. */
  const handleEditPerson = useCallback(
    (entityIndex: number, memberId: string | null) => {
      const member = familyMembers.find((m) => m.id === memberId);
      setEdits((prev) => {
        const newPersons = new Map(prev.persons);
        if (member) {
          newPersons.set(entityIndex, {
            name: member.name,
            personId: member.id,
          });
        } else {
          newPersons.delete(entityIndex);
        }
        return { ...prev, persons: newPersons };
      });
    },
    [familyMembers],
  );

  /**
   * Create a NEW family member from an unmatched extracted person and link
   * the entity to them — the knowledge graph grows from the documents
   * instead of only matching what already exists.
   */
  const handleCreateMember = useCallback(
    async (entityIndex: number, name: string) => {
      const { addFamilyMember } = await import("@/app/(app)/familie/actions");
      const result = await addFamilyMember({ name });
      if (!result.success) return false;

      const newMember = {
        id: result.data.id,
        name: result.data.name,
        role: result.data.role,
      };
      setFamilyMembers((prev) => [...prev, newMember]);
      setEdits((prev) => {
        const newPersons = new Map(prev.persons);
        newPersons.set(entityIndex, {
          name: newMember.name,
          personId: newMember.id,
        });
        return { ...prev, persons: newPersons };
      });
      return true;
    },
    [],
  );

  /** Edit category. */
  const handleEditCategory = useCallback((category: string) => {
    setEdits((prev) => ({ ...prev, category }));
  }, []);

  /** Edit date. */
  const handleEditDate = useCallback(
    (entityIndex: number, date: string) => {
      setEdits((prev) => {
        const newDates = new Map(prev.dates);
        newDates.set(entityIndex, date);
        return { ...prev, dates: newDates };
      });
    },
    [],
  );

  /** Edit task due date. */
  const handleEditFact = useCallback(
    (factIndex: number, value: string) => {
      setEdits((prev) => {
        const factValues = new Map(prev.factValues);
        if (value.trim()) {
          factValues.set(factIndex, value);
        } else {
          factValues.delete(factIndex);
        }
        return { ...prev, factValues };
      });
    },
    [],
  );

  const handleEditTaskDueDate = useCallback(
    (taskIndex: number, dueDate: string) => {
      setEdits((prev) => {
        const newTaskDueDates = new Map(prev.taskDueDates);
        newTaskDueDates.set(taskIndex, dueDate);
        return { ...prev, taskDueDates: newTaskDueDates };
      });
    },
    [],
  );

  /** Delete a task. */
  const handleDeleteTask = useCallback((taskIndex: number) => {
    setEdits((prev) => {
      const newDeleted = new Set(prev.deletedTasks);
      newDeleted.add(taskIndex);
      return { ...prev, deletedTasks: newDeleted };
    });
  }, []);

  /** Resolve disambiguation: select a person. */
  const handleResolveDisambiguation = useCallback(
    (entityIndex: number, memberId: string) => {
      handleEditPerson(entityIndex, memberId);
    },
    [handleEditPerson],
  );

  /** "Alles bestätigen" — confirm the analysis. */
  const handleConfirm = useCallback(async () => {
    if (!analysis || confirming) return;

    // Block confirm while an unresolved low-confidence person
    // disambiguation remains (VAL-REVIEW-009). The user must pick a
    // family member first; the chosen value is sent as the edited
    // person value via buildConfirmPayload.
    if (hasUnresolvedDisambiguation) {
      setConfirmError(
        "Bitte wähle zuerst die richtige Person aus, bevor du bestätigst.",
      );
      return;
    }

    setConfirming(true);
    setConfirmError(null);

    try {
      // Build the edited payload.
      const payload = buildConfirmPayload(
        analysis,
        edits,
      );

      const response = await fetch(
        `/api/documents/${documentId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        let errorBody: { error?: string };
        try {
          errorBody = await response.json();
        } catch {
          errorBody = {};
        }
        throw new Error(
          errorBody.error ||
            "Bestätigen hat nicht geklappt. Bitte nochmal versuchen.",
        );
      }

      setConfirmed(true);
      onConfirmSuccess?.();

      // Re-fetch the analysis so the confirmed success state shows the
      // actually-persisted (edited) data rather than the pre-edit values
      // still held in local state.
      await loadAnalysis();
    } catch (err) {
      setConfirmError(
        err instanceof Error
          ? err.message
          : "Bestätigung fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setConfirming(false);
    }
  }, [
    analysis,
    confirming,
    edits,
    documentId,
    onConfirmSuccess,
    hasUnresolvedDisambiguation,
    loadAnalysis,
  ]);

  /** "Neu analysieren" — re-run extraction. */
  const handleReanalyze = useCallback(async () => {
    if (reanalyzing) return;

    setReanalyzing(true);
    setConfirmError(null);

    try {
      const response = await fetch(
        `/api/documents/${documentId}/analyze`,
        { method: "POST" },
      );

      if (!response.ok) {
        let errorBody: { error?: string };
        try {
          errorBody = await response.json();
        } catch {
          errorBody = {};
        }
        throw new Error(
          errorBody.error ||
            "Das hat nicht geklappt. Bitte nochmal versuchen.",
        );
      }

      // Reset edits and reload analysis.
      setEdits({
        persons: new Map(),
        factValues: new Map(),
        category: null,
        dates: new Map(),
        taskDueDates: new Map(),
        deletedTasks: new Set(),
      });
      setConfirmed(false);
      await loadAnalysis();
      onReanalyzeSuccess?.();
    } catch (err) {
      setConfirmError(
        err instanceof Error
          ? err.message
          : "Analyse fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setReanalyzing(false);
    }
  }, [
    reanalyzing,
    documentId,
    loadAnalysis,
    onReanalyzeSuccess,
  ]);

  // --- Render: pre-analysis pipeline stages ---
  // Nothing to review yet — show real upload/OCR/analysis progress
  // instead of falling through to the "no analysis data" error state.
  if (
    status === "uploaded" ||
    status === "ocr_processing" ||
    status === "ocr_done"
  ) {
    return <ReviewCardProcessing status={status} className={className} />;
  }

  // --- Render: analyzing (skeleton) ---
  if (status === "analyzing" || reanalyzing) {
    return (
      <ReviewCardSkeleton className={className} />
    );
  }

  // --- Render: failed ---
  if (status === "failed") {
    return (
      <ReviewCardError
        errorMessage={errorMessage}
        onRetry={onRetry ?? handleReanalyze}
        className={className}
      />
    );
  }

  // --- Render: confirmed ---
  if (confirmed || status === "confirmed") {
    return (
      <ReviewCardConfirmed
        documentId={documentId}
        analysis={analysis}
        analysisLoading={loading}
        // `confirmed` (local state) is only true right after the user's own
        // confirm action in this session — that's the one moment worth
        // celebrating. Revisiting an already-confirmed document later
        // (status === "confirmed" from the server) shows the same calm,
        // static state instead of replaying the celebration.
        celebrate={confirmed}
        // The follow-up CTA belongs to the same fresh-confirm moment as the
        // celebration: right after adding, invite the next natural action —
        // asking Ordilo about the document.
        askTitle={confirmed ? (analysis?.title ?? null) : null}
        onReanalyze={handleReanalyze}
        reanalyzing={reanalyzing}
        className={className}
      />
    );
  }

  // --- Render: loading analysis ---
  if (loading) {
    return (
      <ReviewCardSkeleton className={className} />
    );
  }

  // --- Render: no analysis data ---
  if (!analysis) {
    return (
      <ReviewCardError
        errorMessage="Keine Analysedaten vorhanden. Bitte neu analysieren."
        onRetry={() => handleReanalyze()}
        className={className}
      />
    );
  }

  // --- Render: full review card ---
  return (
    <ReviewCardContent
      analysis={analysis}
      edits={edits}
      familyMembers={familyMembers}
      existingCategories={existingCategories}
      needsReview={needsReview}
      hasUnresolvedDisambiguation={hasUnresolvedDisambiguation}
      lowConfidencePersons={lowConfidencePersons}
      confirming={confirming}
      confirmError={confirmError}
      onEditPerson={handleEditPerson}
      onCreateMember={handleCreateMember}
      onEditCategory={handleEditCategory}
      onEditDate={handleEditDate}
      onEditTaskDueDate={handleEditTaskDueDate}
      onEditFact={handleEditFact}
      onDeleteTask={handleDeleteTask}
      onResolveDisambiguation={handleResolveDisambiguation}
      onConfirm={handleConfirm}
      onReanalyze={handleReanalyze}
      className={className}
    />
  );
}
