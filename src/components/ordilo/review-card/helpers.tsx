import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import {
  DOCUMENT_TYPE_LABELS,
  type TaskPriority,
} from "@/lib/schemas/extraction";
import type { FamilyMemberOption } from "@/lib/analysis";
import { cn } from "@/lib/utils";
import { Check, AlertTriangle, Search } from "lucide-react";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

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
export interface EditState {
  /** Edited person name (by entity index). */
  persons: Map<number, { name: string; personId: string | null }>;
  /** Edited category. */
  category: string | null;
  /** Edited dates (by entity index). */
  dates: Map<number, string>;
  /** Edited organization names (by entity index). */
  organizationNames: Map<number, string>;
  /** Edited amount values (by entity index). */
  amountValues: Map<number, string>;
  /** Edited task titles (by task index). */
  taskTitles: Map<number, string>;
  /** Edited task priorities (by task index). */
  taskPriorities: Map<number, TaskPriority>;
  /** Edited task due dates (by task index). */
  taskDueDates: Map<number, string>;
  /** Deleted task indices. */
  deletedTasks: Set<number>;
  /** Edited fact values (by fact index) — e.g. a corrected serial number. */
  factValues: Map<number, string>;
}

// ---------------------------------------------------------------------------
// Payload & headline helpers
// ---------------------------------------------------------------------------

/**
 * POST the confirm payload to the confirm endpoint. The single shared
 * call site for confirming a document — the Review Card, the Review
 * Summary, and the ready-to-save card all go through here, so the
 * contract (URL, headers, body shape) can never drift between screens.
 */
export async function postConfirm(
  documentId: string,
  payload: EditedAnalysisPayload,
): Promise<Response> {
  try {
    return await fetch(`/api/documents/${documentId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Without a timeout, a stalled mobile connection leaves the confirm
      // button in its disabled "Wird bestätigt …" state forever.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        "Das Bestätigen dauert gerade zu lange. Bitte erneut versuchen.",
      );
    }
    throw new Error(
      "Netzwerkfehler. Bitte Verbindung überprüfen und erneut versuchen.",
    );
  }
}

/**
 * Build the confirm payload from the analysis and edit state.
 */
export function buildConfirmPayload(
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

  const organizations = analysis.organizations.map((organization, i) => {
    const editedName = edits.organizationNames.get(i);
    return editedName ? { ...organization, name: editedName } : organization;
  });

  const amounts = analysis.amounts.map((amount, i) => {
    const editedValue = edits.amountValues.get(i);
    return editedValue ? { ...amount, amount: editedValue } : amount;
  });

  // Apply task edits and filter deleted tasks.
  const tasks = analysis.tasks
    .map((t, i) => {
      const title = edits.taskTitles.get(i) ?? t.title;
      const priority = edits.taskPriorities.get(i) ?? t.priority;
      const dueDate = edits.taskDueDates.get(i);
      return {
        ...t,
        title,
        priority,
        due_date: dueDate ?? t.due_date,
      };
    })
    .filter((_, i) => !edits.deletedTasks.has(i));

  // Apply fact value edits (e.g. a corrected serial-number digit).
  const facts = analysis.facts.map((f, i) => {
    const edited = edits.factValues.get(i);
    if (edited) {
      return { ...f, value: edited };
    }
    return f;
  });

  return {
    ...analysis,
    family_members: familyMembers,
    suggested_category: suggestedCategory,
    dates,
    organizations,
    amounts,
    tasks,
    facts,
    deletedTaskIndices: [...edits.deletedTasks],
  };
}

export function hasReviewEdits(edits: EditState): boolean {
  return (
    edits.persons.size > 0 ||
    edits.factValues.size > 0 ||
    edits.category !== null ||
    edits.dates.size > 0 ||
    edits.organizationNames.size > 0 ||
    edits.amountValues.size > 0 ||
    edits.taskTitles.size > 0 ||
    edits.taskPriorities.size > 0 ||
    edits.taskDueDates.size > 0 ||
    edits.deletedTasks.size > 0
  );
}

/**
 * Generate the German analysis headline from the analysis data.
 *
 * Examples:
 * - "Rechnung für Emma"
 * - "Brief: Steuerunterlagen 2024"
 * - "Dokument"
 */
export function buildHeadline(analysis: DocumentAnalysis): string {
  const typeLabel = DOCUMENT_TYPE_LABELS[analysis.document_type] || "Dokument";

  if (analysis.family_members.length > 0) {
    const member = analysis.family_members[0];
    return `${typeLabel} für ${member.name}`;
  }

  if (analysis.title && analysis.title.trim()) {
    return `${typeLabel}: ${analysis.title}`;
  }

  return typeLabel;
}

/**
 * Hide generic review filler that adds no value on low-confidence analyses.
 */
export function shouldRenderSummary(summary: string, needsReview: boolean): boolean {
  const normalized = summary.trim();
  if (!normalized) return false;
  if (
    needsReview &&
    /^ein (unscharfer|unsicherer) hinweis mit unsicheren angaben\.?$/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

/**
 * Get the German label for a task priority.
 */
export function getPriorityLabel(priority: string): string {
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
export function getPriorityBadgeClasses(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-[#FFEBEE] text-[#C62828]";
    case "low":
      return "bg-[#E8F5E9] text-[#2E7D32]";
    default:
      return "bg-[#FFF3E0] text-[#E65100]";
  }
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

/**
 * "bearbeitet" tag for edited entities.
 */
export function EditedTag() {
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
 * Groups one field type's rows (e.g. all persons, all dates) so the
 * outer test id still targets the whole field, while the flat divider
 * lines drawn by `FieldRow`'s parent continue evenly across every row —
 * whether it's the only row in the group or one of several.
 */
export function FieldGroup({
  testId,
  children,
}: {
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="divide-y divide-border/60">
      {children}
    </div>
  );
}

/**
 * A section for related extracted values. It introduces the field type once,
 * then lets every row focus on its actual value and edit control.
 */
export function ReviewFieldSection({
  icon: Icon,
  title,
  testId,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="border-b border-border/60 py-4 first:pt-0">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-[var(--mist-dark)]">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </h4>
      <div className="mt-2 divide-y divide-border/60">{children}</div>
    </section>
  );
}

/**
 * A single, flat field row with an optional contextual label and edit
 * control. Grouped sections introduce their label once, so their rows can
 * focus on the extracted value. No background tint: per the design system's
 * no-shadow-stacking rule, rows rely on hairline dividers, never nested boxes.
 *
 * The confidence badge only appears for medium/low confidence — i.e.
 * fields actually worth a second look. A well-extracted field (the vast
 * majority) shows no percentage at all: a number that's "95%" on every
 * row trains the eye to ignore it, which is the opposite of a signal.
 * Reserving it for medium/low keeps its appearance meaningful and lets
 * the fields that truly need attention stand out instead of competing
 * with a wall of decorative statistics.
 */
export function FieldRow({
  icon: Icon,
  label,
  confidence,
  isEdited = false,
  editControl,
  onCompareOriginal,
  sourceText,
  onShowSource,
  testId,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label?: string;
  confidence?: number;
  isEdited?: boolean;
  editControl?: React.ReactNode;
  onCompareOriginal?: () => void;
  /** Exact value to locate in the original OCR layout. */
  sourceText?: string;
  onShowSource?: (sourceText: string) => void;
  testId?: string;
  children: React.ReactNode;
}) {
  const shouldReview = confidence !== undefined && confidence < 0.85;

  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col gap-2.5 py-3 sm:flex-row sm:items-start sm:gap-3",
        !label && "sm:gap-2",
      )}
    >
      {Icon && label && (
        <div className="flex shrink-0 items-center gap-1.5 text-[var(--mist-dark)] sm:w-32 sm:pt-0.5">
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate text-sm">{label}</span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-sm font-medium text-foreground">{children}</div>
          {(shouldReview || editControl || (sourceText && onShowSource)) && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-0.5">
              {shouldReview && (
                <span
                  className="mr-1 inline-flex items-center gap-1 rounded-full bg-[var(--sand-warm)] px-2 py-1 text-xs font-medium text-foreground"
                  data-testid="field-review-cue"
                >
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  Bitte prüfen
                </span>
              )}
              {sourceText && onShowSource && (
                <button
                  type="button"
                  onClick={() => onShowSource(sourceText)}
                  className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-[var(--petrol)]/10 hover:text-[var(--petrol)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label="Im Original zeigen"
                  title="Im Original zeigen"
                >
                  <Search className="size-4" aria-hidden="true" />
                </button>
              )}
              {editControl}
            </div>
          )}
        </div>

        {isEdited && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EditedTag />
          </div>
        )}
        {onCompareOriginal && (
          <button
            type="button"
            onClick={onCompareOriginal}
            className="mt-2 inline-flex items-center rounded-ordilo-sm py-0.5 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Im Original vergleichen
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Disambiguation prompt for low-confidence person entities.
 */
export function DisambiguationPrompt({
  lowConfidencePersons,
  familyMembers,
  onResolve,
}: {
  lowConfidencePersons: { member: DocumentAnalysis["family_members"][0]; index: number }[];
  familyMembers: FamilyMemberOption[];
  onResolve: (entityIndex: number, memberId: string) => void;
}) {
  return (
    <div
      data-testid="disambiguation-prompt"
      className="rounded-ordilo-sm bg-white/75 p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-[var(--apricot)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Bitte ordne dieses Dokument der richtigen Person zu.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Danach kannst du es direkt ins Familienbuch übernehmen.
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
