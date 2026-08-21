import type { DocumentAnalysis } from "@/lib/schemas/extraction";
import {
  DOCUMENT_TYPE_LABELS,
} from "@/lib/schemas/extraction";
import {
  findCalendarCandidates,
  selectedCalendarEvents,
} from "@/lib/calendar-heuristics";
import type { FamilyMemberOption } from "@/lib/analysis";
import { cn } from "@/lib/utils";
import { Check, AlertTriangle, Search } from "lucide-react";
import {
  PersonPicker,
  unmatchedPersonName,
} from "@/components/ordilo/person-picker";

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
  /**
   * Dates kept checked in the review step's planner offer — the confirm
   * route turns them into Familienplaner events linked to the document.
   */
  calendar_events: { date: string; label: string }[];
}

/**
 * Internal type for tracking which entities have been edited.
 */
export interface EditState {
  /** Edited document title, or null when the extracted title stands. */
  title: string | null;
  /** Edited summary ("Worum geht's"), or null when unchanged. */
  summary: string | null;
  /**
   * Edited person name (by entity index). An entry with an empty name and
   * null personId means "explicitly assigned to nobody" — the extracted
   * person is dropped from the confirm payload.
   */
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
  /** Edited task due dates (by task index). */
  taskDueDates: Map<number, string>;
  /** Deleted task indices. */
  deletedTasks: Set<number>;
  /** Edited fact values (by fact index) — e.g. a corrected serial number. */
  factValues: Map<number, string>;
  /**
   * Planner-toggle overrides (by date index) for the review step's
   * "In den Familienplaner legen?" offer. An entry only exists once the
   * user has flipped a date away from its heuristic default — no entry
   * means the default (appointments on, deadlines off) applies.
   */
  calendarDates: Map<number, boolean>;
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
  // Apply person edits. An edit with an empty name means "assigned to
  // nobody" — the extracted person is dropped entirely instead of being
  // saved as an unlinked entity.
  const familyMembers = analysis.family_members
    .map((m, i) => {
      const edited = edits.persons.get(i);
      if (edited) {
        return {
          ...m,
          name: edited.name,
          person_id: edited.personId,
        };
      }
      return m;
    })
    .filter((m) => m.name.trim().length > 0);

  // A person the user assigned although the extraction found none (edit
  // index beyond the extracted list) is appended as a new entity — the
  // confirm route persists it like any extracted person. Without this,
  // assigning a person to a document with no recognized name was a
  // silent no-op.
  edits.persons.forEach((edit, index) => {
    if (index >= analysis.family_members.length && edit.name.trim().length > 0) {
      familyMembers.push({
        person_id: edit.personId,
        name: edit.name,
        confidence: 1,
      });
    }
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
      const dueDate = edits.taskDueDates.get(i);
      return {
        ...t,
        title,
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

  // Planner events: the future dates the user kept checked in the
  // "In den Familienplaner legen?" offer. The candidates are computed
  // from the EDITED dates, so a corrected date lands in the planner
  // exactly as fixed. With untouched toggles (empty overrides) the
  // heuristic defaults apply — which is also what the scan wizard's
  // one-tap "Passt so" path sends.
  const calendarEvents = selectedCalendarEvents(
    findCalendarCandidates(dates),
    edits.calendarDates,
  );

  return {
    ...analysis,
    title: edits.title ?? analysis.title,
    summary: edits.summary ?? analysis.summary,
    family_members: familyMembers,
    suggested_category: suggestedCategory,
    dates,
    organizations,
    contacts: analysis.contacts ?? [],
    amounts,
    tasks,
    facts,
    calendar_events: calendarEvents,
    deletedTaskIndices: [...edits.deletedTasks],
  };
}

/**
 * An empty edit state — the single definition of "nothing changed yet",
 * so mounting the card and resetting it after a re-analyze or a saved
 * edit can never drift apart.
 */
export function emptyEditState(): EditState {
  return {
    title: null,
    summary: null,
    persons: new Map(),
    factValues: new Map(),
    category: null,
    dates: new Map(),
    organizationNames: new Map(),
    amountValues: new Map(),
    taskTitles: new Map(),
    taskDueDates: new Map(),
    deletedTasks: new Set(),
    calendarDates: new Map(),
  };
}

/**
 * PATCH the edited analysis of a document that is already in the family
 * book. Unlike confirm, this never re-runs extraction or embeddings: it
 * saves exactly what the user corrected.
 *
 * Tasks and facts are deliberately not sent — both are edited where they
 * live (the task sheet, the "Nummern & Kennungen" rows), and the route
 * would otherwise reset task status and assignment.
 */
export async function patchDocument(
  documentId: string,
  payload: EditedAnalysisPayload,
): Promise<Response> {
  const updatable = {
    document_type: payload.document_type,
    title: payload.title,
    summary: payload.summary,
    family_members: payload.family_members,
    organizations: payload.organizations,
    dates: payload.dates,
    amounts: payload.amounts,
    suggested_category: payload.suggested_category,
    tags: payload.tags,
    contacts: payload.contacts ?? [],
  };

  try {
    return await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatable),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        "Das Speichern dauert gerade zu lange. Bitte erneut versuchen.",
      );
    }
    throw new Error(
      "Netzwerkfehler. Bitte Verbindung überprüfen und erneut versuchen.",
    );
  }
}

export function hasReviewEdits(edits: EditState): boolean {
  return (
    edits.title !== null ||
    edits.summary !== null ||
    edits.persons.size > 0 ||
    edits.factValues.size > 0 ||
    edits.category !== null ||
    edits.dates.size > 0 ||
    edits.organizationNames.size > 0 ||
    edits.amountValues.size > 0 ||
    edits.taskTitles.size > 0 ||
    edits.taskDueDates.size > 0 ||
    edits.deletedTasks.size > 0 ||
    edits.calendarDates.size > 0
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
export function buildHeadline(
  analysis: DocumentAnalysis,
  /**
   * The person the document is currently assigned to, when the user has
   * changed it: a name, or null for "assigned to nobody". Pass undefined
   * (or omit) to use the extracted person. Without this the headline keeps
   * claiming "Brief für Michelle" after the user chose "Ohne Person".
   */
  assignedPersonName?: string | null,
): string {
  const typeLabel = DOCUMENT_TYPE_LABELS[analysis.document_type] || "Dokument";

  const person =
    assignedPersonName !== undefined
      ? assignedPersonName
      : (analysis.family_members[0]?.name ?? null);

  if (person) {
    return `${typeLabel} für ${person}`;
  }

  // No person (none extracted, or assigned to nobody) — name the document
  // by its own title instead.
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
                  className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-[var(--petrol)]/10 hover:text-[var(--petrol)] focus-ring"
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
            className="mt-2 inline-flex items-center rounded-ordilo-sm py-0.5 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-ring"
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
 *
 * Uses the same PersonPicker as every other person assignment surface, so
 * the blocked-confirm moment offers the full vocabulary too: pick a
 * member, assign nobody, or create the person the extraction misread —
 * previously a dead end here.
 */
export function DisambiguationPrompt({
  lowConfidencePersons,
  familyMembers,
  onResolve,
  onCreateMember,
}: {
  lowConfidencePersons: { member: DocumentAnalysis["family_members"][0]; index: number }[];
  familyMembers: FamilyMemberOption[];
  onResolve: (entityIndex: number, memberId: string | null) => void;
  /** Create a new family member and resolve the entity to them. */
  onCreateMember?: (entityIndex: number, name: string) => Promise<boolean>;
}) {
  // Resolve for the first unresolved low-confidence person.
  const first = lowConfidencePersons[0];

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
      <PersonPicker
        className="mt-3"
        familyMembers={familyMembers}
        value={undefined}
        onChange={(memberId) => {
          if (first) onResolve(first.index, memberId);
        }}
        createName={
          first
            ? unmatchedPersonName(
                first.member.name,
                first.member.person_id,
                familyMembers,
              )
            : null
        }
        onCreate={
          onCreateMember && first
            ? (name) => onCreateMember(first.index, name)
            : undefined
        }
        testIdPrefix="disambiguation"
      />
    </div>
  );
}
