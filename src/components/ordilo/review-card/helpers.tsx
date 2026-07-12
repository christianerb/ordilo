import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import { DOCUMENT_TYPE_LABELS } from "@/lib/schemas/extraction";
import type { FamilyMemberOption } from "@/lib/analysis";
import { ConfidenceBadge, getConfidenceLevel } from "@/components/ordilo/confidence-badge";
import { Check, AlertTriangle } from "lucide-react";

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
 * Summary, the zero-touch auto-file, and the wizard-close flush all go
 * through here, so the contract (URL, headers, body shape) can never
 * drift between paths.
 */
export function postConfirm(
  documentId: string,
  payload: EditedAnalysisPayload,
): Promise<Response> {
  return fetch(`/api/documents/${documentId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
    tasks,
    facts,
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
export function buildHeadline(analysis: DocumentAnalysis): string {
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

/**
 * Get the German article (ein/eine) for a noun.
 * Simple heuristic: feminine nouns get "eine", others get "ein".
 */
export function getArticle(noun: string): string {
  const feminine = ["Rechnung", "Versicherung", "Arztbrief", "Schule"];
  if (feminine.includes(noun)) return "eine";
  return "ein";
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
 * A single, flat field row — icon + label, value, and an optional edit
 * control, all on one line (label repeats per row rather than sitting in
 * a group header, so every row reads on its own and the whole field list
 * can share one continuous divider list). No border, no background
 * tint: per the design system's no-shadow-stacking rule, the outer
 * `ReviewCardContent` card is the single bordered surface, and rows
 * inside it are separated only by hairline dividers — never boxes within
 * a box.
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
  testId,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  confidence?: number;
  isEdited?: boolean;
  editControl?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-start sm:gap-3"
    >
      <div className="flex shrink-0 items-center gap-1.5 text-[var(--mist-dark)] sm:w-32 sm:pt-0.5">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-sm">{label}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="min-w-0 text-sm font-medium text-foreground">{children}</div>

        {(isEdited ||
          (confidence !== undefined &&
            getConfidenceLevel(confidence) !== "high")) && (
          <div className="flex flex-wrap items-center gap-2">
            {isEdited && <EditedTag />}
            {confidence !== undefined && getConfidenceLevel(confidence) !== "high" && (
              <ConfidenceBadge confidence={confidence} />
            )}
          </div>
        )}

        {editControl && (
          <div className="w-full sm:max-w-[18rem]">
            {editControl}
          </div>
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
