"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  RefreshCw,
  AlertCircle,
  Pencil,
  Trash2,
  Calendar,
  Tag,
  User,
  Building2,
  Euro,
  ListTodo,
  AlertTriangle,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/ordilo/confidence-badge";
import {
  DOCUMENT_TYPE_LABELS,
  LOW_CONFIDENCE_THRESHOLD,
  type DocumentAnalysis,
} from "@/lib/schemas/extraction";
import {
  fetchDocumentAnalysis,
  fetchFamilyMembers,
  fetchExistingCategories,
  type FamilyMemberOption,
} from "@/lib/analysis";
import { formatGermanDate } from "@/lib/format";

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

/**
 * The edited analysis payload sent to the confirm API route.
 * This extends DocumentAnalysis with edit tracking metadata.
 */
export interface EditedAnalysisPayload extends DocumentAnalysis {
  /** IDs of deleted tasks (excluded from confirm). */
  deletedTaskIndices: number[];
}

/**
 * Internal type for tracking which entities have been edited.
 */
interface EditState {
  /** Edited person name (by entity index). */
  persons: Map<number, { name: string; personId: string | null }>;
  /** Edited category. */
  category: string | null;
  /** Edited dates (by entity index). */
  dates: Map<number, string>;
  /** Edited task due dates (by task index). */
  taskDueDates: Map<number, string>;
  /** Deleted task indices. */
  deletedTasks: Set<number>;
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
 *   - `analyzing`: Skeleton loading state with disabled controls
 *   - `analyzed`: Full review card with all fields, edit flows, confirm
 *   - `failed`: Friendly error with retry
 *   - other: Compact waiting state
 *
 * Features:
 * - German analysis headline ("Ich glaube, das ist ein Kita-Brief für Emma")
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
  useEffect(() => {
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
  }, []);

  // --- Fetch analysis when status is analyzed ---
  const loadAnalysis = useCallback(async () => {
    if (status !== "analyzed") {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchDocumentAnalysis(documentId);
    setAnalysis(result);
    setLoading(false);
  }, [documentId, status]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

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
            "Bestätigung fehlgeschlagen. Bitte erneut versuchen.",
        );
      }

      setConfirmed(true);
      onConfirmSuccess?.();
    } catch (err) {
      setConfirmError(
        err instanceof Error
          ? err.message
          : "Bestätigung fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setConfirming(false);
    }
  }, [analysis, confirming, edits, documentId, onConfirmSuccess]);

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
            "Analyse fehlgeschlagen. Bitte erneut versuchen.",
        );
      }

      // Reset edits and reload analysis.
      setEdits({
        persons: new Map(),
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
      <ReviewCardConfirmed className={className} />
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
      onEditCategory={handleEditCategory}
      onEditDate={handleEditDate}
      onEditTaskDueDate={handleEditTaskDueDate}
      onDeleteTask={handleDeleteTask}
      onResolveDisambiguation={handleResolveDisambiguation}
      onConfirm={handleConfirm}
      onReanalyze={handleReanalyze}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Build the confirm payload from the analysis and edit state.
 */
function buildConfirmPayload(
  analysis: DocumentAnalysis,
  edits: EditState,
): EditedAnalysisPayload {
  // Apply person edits.
  const familyMembers = analysis.family_members.map((m, i) => {
    const edited = edits.persons.get(i);
    if (edited) {
      return {
        ...m,
        name: edited.name,
        person_id: edited.personId,
      };
    }
    return m;
  });

  // Apply category edit.
  const suggestedCategory = edits.category ?? analysis.suggested_category;

  // Apply date edits.
  const dates = analysis.dates.map((d, i) => {
    const edited = edits.dates.get(i);
    if (edited) {
      return { ...d, date: edited };
    }
    return d;
  });

  // Apply task due date edits and filter deleted tasks.
  const tasks = analysis.tasks
    .map((t, i) => {
      const edited = edits.taskDueDates.get(i);
      if (edited) {
        return { ...t, due_date: edited };
      }
      return t;
    })
    .filter((_, i) => !edits.deletedTasks.has(i));

  return {
    ...analysis,
    family_members: familyMembers,
    suggested_category: suggestedCategory,
    dates,
    tasks,
    deletedTaskIndices: [...edits.deletedTasks],
  };
}

/**
 * Generate the German analysis headline from the analysis data.
 *
 * Examples:
 * - "Ich glaube, das ist ein Brief für Emma"
 * - "Ich glaube, das ist eine Rechnung: Stromrechnung Juli"
 * - "Ich glaube, das ist ein Dokument"
 */
function buildHeadline(analysis: DocumentAnalysis): string {
  const typeLabel = DOCUMENT_TYPE_LABELS[analysis.document_type] || "Dokument";

  // Use the appropriate article.
  const article = getArticle(typeLabel);

  // If there's a family member, mention them.
  if (analysis.family_members.length > 0) {
    const member = analysis.family_members[0];
    return `Ich glaube, das ist ${article} ${typeLabel} für ${member.name}`;
  }

  // If there's a title, mention it.
  if (analysis.title && analysis.title.trim()) {
    return `Ich glaube, das ist ${article} ${typeLabel}: ${analysis.title}`;
  }

  return `Ich glaube, das ist ${article} ${typeLabel}`;
}

/**
 * Get the German article (ein/eine) for a noun.
 * Simple heuristic: feminine nouns get "eine", others get "ein".
 */
function getArticle(noun: string): string {
  const feminine = ["Rechnung", "Versicherung", "Arztbrief", "Schule"];
  if (feminine.includes(noun)) return "eine";
  return "ein";
}

/**
 * Full review card content — renders all extracted fields with
 * confidence badges, edit flows, and action buttons.
 */
function ReviewCardContent({
  analysis,
  edits,
  familyMembers,
  existingCategories,
  needsReview,
  hasUnresolvedDisambiguation,
  lowConfidencePersons,
  confirming,
  confirmError,
  onEditPerson,
  onEditCategory,
  onEditDate,
  onEditTaskDueDate,
  onDeleteTask,
  onResolveDisambiguation,
  onConfirm,
  onReanalyze,
  className,
}: {
  analysis: DocumentAnalysis;
  edits: EditState;
  familyMembers: FamilyMemberOption[];
  existingCategories: string[];
  needsReview: boolean;
  hasUnresolvedDisambiguation: boolean;
  lowConfidencePersons: { member: DocumentAnalysis["family_members"][0]; index: number }[];
  confirming: boolean;
  confirmError: string | null;
  onEditPerson: (entityIndex: number, memberId: string | null) => void;
  onEditCategory: (category: string) => void;
  onEditDate: (entityIndex: number, date: string) => void;
  onEditTaskDueDate: (taskIndex: number, dueDate: string) => void;
  onDeleteTask: (taskIndex: number) => void;
  onResolveDisambiguation: (entityIndex: number, memberId: string) => void;
  onConfirm: () => void;
  onReanalyze: () => void;
  className?: string;
}) {
  const headline = buildHeadline(analysis);
  const activeTasks = analysis.tasks
    .map((t, i) => ({ task: t, index: i }))
    .filter(({ index }) => !edits.deletedTasks.has(index));

  return (
    <div
      data-testid="review-card"
      data-needs-review={needsReview}
      className={cn(
        "rounded-ordilo-lg border bg-card p-5 shadow-card",
        needsReview
          ? "border-[var(--apricot)]/30 bg-[var(--sand-warm)]/30"
          : "border-border",
        className,
      )}
    >
      {/* needs_user_review badge */}
      {needsReview && (
        <div className="mb-4 flex items-center gap-2">
          <span
            data-testid="review-needed-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--apricot)]/30 bg-[var(--apricot)]/10 px-3 py-1 text-xs font-medium text-[var(--apricot)]"
          >
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Überprüfung nötig
          </span>
        </div>
      )}

      {/* Headline */}
      <div className="mb-4">
        <h3
          data-testid="review-headline"
          className="text-lg font-semibold leading-snug text-foreground"
        >
          {headline}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {DOCUMENT_TYPE_LABELS[analysis.document_type]}
        </p>
      </div>

      {/* Summary */}
      {analysis.summary && analysis.summary.trim() && (
        <div data-testid="review-summary" className="mb-4">
          <p className="text-sm leading-relaxed text-[var(--mist-dark)]">
            {analysis.summary}
          </p>
        </div>
      )}

      {/* Disambiguation prompt */}
      {hasUnresolvedDisambiguation && (
        <DisambiguationPrompt
          lowConfidencePersons={lowConfidencePersons}
          familyMembers={familyMembers}
          onResolve={onResolveDisambiguation}
        />
      )}

      {/* Fields */}
      <div className="space-y-4">
        {/* Persons */}
        {analysis.family_members.length > 0 && (
          <FieldSection
            icon={User}
            label="Personen"
            testId="review-persons"
          >
            {analysis.family_members.map((member, i) => {
              const edited = edits.persons.get(i);
              const isEdited = Boolean(edited);
              const displayName = edited?.name ?? member.name;
              return (
                <EntityRow
                  key={i}
                  confidence={member.confidence}
                  isEdited={isEdited}
                  editControl={
                    <PersonEditControl
                      value={edited?.personId ?? member.person_id ?? null}
                      familyMembers={familyMembers}
                      onChange={(memberId) => onEditPerson(i, memberId)}
                    />
                  }
                >
                  <span className="font-medium text-foreground">
                    {displayName}
                  </span>
                </EntityRow>
              );
            })}
          </FieldSection>
        )}

        {/* Organizations */}
        {analysis.organizations.length > 0 && (
          <FieldSection
            icon={Building2}
            label="Organisationen"
            testId="review-organizations"
          >
            {analysis.organizations.map((org, i) => (
              <EntityRow key={i} confidence={org.confidence}>
                <span className="font-medium text-foreground">{org.name}</span>
                {org.type && org.type !== "organization" && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {org.type}
                  </span>
                )}
              </EntityRow>
            ))}
          </FieldSection>
        )}

        {/* Dates */}
        {analysis.dates.length > 0 && (
          <FieldSection
            icon={Calendar}
            label="Daten"
            testId="review-dates"
          >
            {analysis.dates.map((date, i) => {
              const edited = edits.dates.get(i);
              const isEdited = Boolean(edited);
              const displayDate = edited ?? date.date;
              const formatted = formatGermanDate(displayDate) || displayDate;
              return (
                <EntityRow
                  key={i}
                  confidence={date.confidence}
                  isEdited={isEdited}
                  editControl={
                    <DateEditControl
                      value={displayDate}
                      label={date.label}
                      onChange={(d) => onEditDate(i, d)}
                    />
                  }
                >
                  <span className="font-medium text-foreground">
                    {formatted}
                  </span>
                  {date.label && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      {date.label}
                    </span>
                  )}
                </EntityRow>
              );
            })}
          </FieldSection>
        )}

        {/* Amounts */}
        {analysis.amounts.length > 0 && (
          <FieldSection
            icon={Euro}
            label="Beträge"
            testId="review-amounts"
          >
            {analysis.amounts.map((amount, i) => (
              <EntityRow key={i} confidence={amount.confidence}>
                <span className="font-medium text-foreground">
                  {amount.amount} {amount.currency}
                </span>
                {amount.label && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {amount.label}
                  </span>
                )}
              </EntityRow>
            ))}
          </FieldSection>
        )}

        {/* Tasks */}
        {activeTasks.length > 0 && (
          <FieldSection
            icon={ListTodo}
            label="Aufgaben"
            testId="review-tasks"
          >
            {activeTasks.map(({ task, index }) => {
              const editedDueDate = edits.taskDueDates.get(index);
              const isEdited = Boolean(editedDueDate);
              const displayDueDate = editedDueDate ?? task.due_date;
              const priorityLabel = getPriorityLabel(task.priority);
              return (
                <div
                  key={index}
                  data-testid={`review-task-${index}`}
                  className="flex items-start gap-2 rounded-ordilo-sm border border-border bg-[var(--sand-light)] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {displayDueDate && (
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="size-3.5" aria-hidden="true" />
                          {formatGermanDate(displayDueDate) || displayDueDate}
                          <DateEditControl
                            value={displayDueDate}
                            label="Frist"
                            onChange={(d) => onEditTaskDueDate(index, d)}
                            compact
                          />
                        </span>
                      )}
                      {!displayDueDate && (
                        <DateEditControl
                          value=""
                          label="Frist hinzufügen"
                          onChange={(d) => onEditTaskDueDate(index, d)}
                          compact
                          showAddButton
                        />
                      )}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          getPriorityBadgeClasses(task.priority),
                        )}
                      >
                        {priorityLabel}
                      </span>
                      {isEdited && <EditedTag />}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <ConfidenceBadge confidence={task.confidence} />
                    <button
                      type="button"
                      onClick={() => onDeleteTask(index)}
                      className="flex size-7 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      aria-label="Aufgabe löschen"
                      data-testid={`delete-task-${index}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </FieldSection>
        )}

        {/* Empty tasks state */}
        {analysis.tasks.length > 0 && activeTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Alle Aufgaben wurden entfernt.
          </p>
        )}

        {/* Category */}
        <FieldSection
          icon={Tag}
          label="Kategorie"
          testId="review-category"
        >
          <EntityRow
            confidence={1}
            isEdited={edits.category !== null}
            editControl={
              <CategoryEditControl
                value={edits.category ?? analysis.suggested_category}
                existingCategories={existingCategories}
                onChange={onEditCategory}
              />
            }
          >
            <span className="font-medium text-foreground">
              {edits.category ?? analysis.suggested_category}
            </span>
          </EntityRow>
        </FieldSection>

        {/* Tags */}
        {analysis.tags.length > 0 && (
          <FieldSection
            icon={Tag}
            label="Tags"
            testId="review-tags"
          >
            <div className="flex flex-wrap gap-2">
              {analysis.tags.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-[var(--sand-light)] px-2.5 py-1 text-xs font-medium text-[var(--mist-dark)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </FieldSection>
        )}
      </div>

      {/* Confirm error */}
      {confirmError && (
        <div className="mt-4 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{confirmError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-col gap-2.5">
        <Button
          type="button"
          size="lg"
          onClick={onConfirm}
          disabled={confirming}
          className="h-12 rounded-ordilo-md w-full"
          data-testid="confirm-button"
        >
          {confirming ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Wird bestätigt …
            </>
          ) : (
            <>
              <Check className="size-4" aria-hidden="true" />
              Alles bestätigen
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onReanalyze}
          disabled={confirming}
          className="h-12 rounded-ordilo-md w-full"
          data-testid="reanalyze-button"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Neu analysieren
        </Button>
      </div>
    </div>
  );
}

/**
 * Disambiguation prompt for low-confidence person entities.
 */
function DisambiguationPrompt({
  lowConfidencePersons,
  familyMembers,
  onResolve,
}: {
  lowConfidencePersons: { member: DocumentAnalysis["family_members"][0]; index: number }[];
  familyMembers: FamilyMemberOption[];
  onResolve: (entityIndex: number, memberId: string) => void;
}) {
  // Build candidate names for the prompt text.
  const candidateNames = familyMembers.slice(0, 3).map((m) => m.name);
  const promptText =
    candidateNames.length >= 2
      ? `Ich bin mir nicht sicher, ob dieses Dokument zu ${candidateNames.slice(0, -1).join(" oder ")} oder ${candidateNames[candidateNames.length - 1]} gehört`
      : "Ich bin mir nicht sicher, wem dieses Dokument zugeordnet werden soll";

  return (
    <div
      data-testid="disambiguation-prompt"
      className="mb-4 rounded-ordilo-md border border-[var(--apricot)]/30 bg-[var(--apricot)]/5 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-[var(--apricot)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {promptText}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bitte wähle die richtige Person:
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {familyMembers.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => {
              // Resolve for the first unresolved low-confidence person.
              const first = lowConfidencePersons[0];
              if (first) {
                onResolve(first.index, member.id);
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-all hover:border-[var(--petrol)] hover:bg-[var(--petrol)]/5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid={`disambiguation-option-${member.id}`}
          >
            <span
              className="flex size-6 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: "var(--petrol)" }}
              aria-hidden="true"
            >
              {member.name.charAt(0).toUpperCase()}
            </span>
            {member.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Field section with an icon and label header.
 */
function FieldSection({
  icon: Icon,
  label,
  testId,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className="size-4 text-[var(--mist)]"
          aria-hidden="true"
        />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--mist)]">
          {label}
        </h4>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Entity row with confidence badge and optional edit control.
 */
function EntityRow({
  confidence,
  isEdited = false,
  editControl,
  children,
}: {
  confidence: number;
  isEdited?: boolean;
  editControl?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-ordilo-sm border bg-[var(--sand-light)] p-3",
        isEdited
          ? "border-[var(--petrol)]/30 bg-[var(--blue-soft)]/30"
          : "border-border",
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-2">
        {isEdited && <EditedTag />}
        <ConfidenceBadge confidence={confidence} />
        {editControl}
      </div>
    </div>
  );
}

/**
 * "bearbeitet" tag for edited entities.
 */
function EditedTag() {
  return (
    <span
      data-testid="edited-tag"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--petrol)]/20 bg-[var(--petrol)]/10 px-2 py-0.5 text-xs font-medium text-[var(--petrol)]"
    >
      <Check className="size-3" aria-hidden="true" />
      bearbeitet
    </span>
  );
}

/**
 * Person edit control — a dropdown of family members.
 */
function PersonEditControl({
  value,
  familyMembers,
  onChange,
}: {
  value: string | null;
  familyMembers: FamilyMemberOption[];
  onChange: (memberId: string | null) => void;
}) {
  if (familyMembers.length === 0) return null;

  return (
    <div className="relative">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="appearance-none rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 pr-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Person ändern"
        data-testid="person-edit-select"
      >
        <option value="">Person wählen …</option>
        {familyMembers.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
            {member.role ? ` (${member.role})` : ""}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Category edit control — existing categories + free-text.
 */
function CategoryEditControl({
  value,
  existingCategories,
  onChange,
}: {
  value: string;
  existingCategories: string[];
  onChange: (category: string) => void;
}) {
  const [isFreeText, setIsFreeText] = useState(false);
  const [freeTextValue, setFreeTextValue] = useState("");

  // Check if the current value is in the existing categories.
  const isInExisting = existingCategories.includes(value);

  if (isFreeText || (!isInExisting && value && existingCategories.length > 0)) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={freeTextValue || value}
          onChange={(e) => {
            setFreeTextValue(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="Eigene Kategorie"
          className="w-32 rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Kategorie eingeben"
          data-testid="category-edit-input"
        />
        {existingCategories.length > 0 && (
          <button
            type="button"
            onClick={() => setIsFreeText(false)}
            className="flex size-7 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Zurück zur Auswahl"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__free__") {
            setIsFreeText(true);
            setFreeTextValue("");
          } else {
            onChange(e.target.value);
          }
        }}
        className="appearance-none rounded-ordilo-sm border border-border bg-card px-2.5 py-1.5 pr-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Kategorie ändern"
        data-testid="category-edit-select"
      >
        {existingCategories.length === 0 && (
          <option value={value}>{value}</option>
        )}
        {existingCategories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
        <option value="__free__">+ Eigene Kategorie …</option>
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Date edit control — a date input field.
 */
function DateEditControl({
  value,
  label,
  onChange,
  compact = false,
  showAddButton = false,
}: {
  value: string;
  label: string;
  onChange: (date: string) => void;
  compact?: boolean;
  showAddButton?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (showAddButton && !isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
        aria-label={label}
        data-testid="add-date-button"
      >
        <Calendar className="size-3.5" aria-hidden="true" />
        {label}
      </button>
    );
  }

  if (compact && !isEditing && value) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
        aria-label={`${label} bearbeiten`}
        data-testid="edit-date-button"
      >
        <Pencil className="size-3" aria-hidden="true" />
      </button>
    );
  }

  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setIsEditing(false)}
      autoFocus={isEditing}
      className={cn(
        "rounded-ordilo-sm border border-border bg-card px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        compact ? "w-28" : "w-32",
      )}
      aria-label={label}
      data-testid="date-edit-input"
    />
  );
}

/**
 * Skeleton loading state for the review card.
 */
function ReviewCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-testid="review-card-skeleton"
      className={cn(
        "rounded-ordilo-lg border border-border bg-card p-5 shadow-card",
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
 * Error state for the review card.
 */
function ReviewCardError({
  errorMessage,
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
        "rounded-ordilo-lg border border-destructive/20 bg-destructive/5 p-5 shadow-card",
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
        <h3 className="mt-3 text-lg font-semibold text-foreground">
          Analyse fehlgeschlagen
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {errorMessage ||
            "Die Analyse konnte nicht abgeschlossen werden. Bitte erneut versuchen."}
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
            Erneut versuchen
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmed state for the review card.
 */
function ReviewCardConfirmed({ className }: { className?: string }) {
  return (
    <div
      data-testid="review-card-confirmed"
      className={cn(
        "rounded-ordilo-lg border border-[#2E7D32]/20 bg-[#E8F5E9]/30 p-5 shadow-card",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center">
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "#2E7D32" }}
        >
          <Check
            className="size-6 text-white"
            strokeWidth={2}
            aria-hidden="true"
          />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-foreground">
          Bestätigt
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Dieses Dokument wurde bestätigt und ist jetzt durchsuchbar.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the German label for a task priority.
 */
function getPriorityLabel(priority: string): string {
  switch (priority) {
    case "high":
      return "Hoch";
    case "low":
      return "Niedrig";
    default:
      return "Mittel";
  }
}

/**
 * Get the badge classes for a task priority.
 */
function getPriorityBadgeClasses(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-[#FFEBEE] text-[#C62828]";
    case "low":
      return "bg-[#E8F5E9] text-[#2E7D32]";
    default:
      return "bg-[#FFF3E0] text-[#E65100]";
  }
}
