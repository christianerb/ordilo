import { useState } from "react";
import {
  Check,
  RefreshCw,
  AlertCircle,
  Calendar,
  Tag,
  User,
  Building2,
  Euro,
  Hash,
  ListTodo,
  Trash2,
  UserPlus,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_TYPE_LABELS,
  FACT_TYPE_LABELS,
  type DocumentAnalysis,
} from "@/lib/schemas/extraction";
import { formatGermanDate } from "@/lib/format";
import type { FamilyMemberOption } from "@/lib/analysis";
import type { EditState } from "./helpers";
import {
  getPriorityLabel,
  getPriorityBadgeClasses,
  shouldRenderSummary,
  FieldRow,
  EditedTag,
  DisambiguationPrompt,
  FieldGroup,
} from "./helpers";
import {
  PersonEditControl,
  CategoryEditControl,
  DateEditControl,
  FactEditControl,
} from "./edit-controls";

/**
 * Full review card content — renders all extracted fields with
 * confidence badges, edit flows, and action buttons.
 */
export function ReviewCardContent({
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
  onCreateMember,
  onEditCategory,
  onEditDate,
  onEditTaskDueDate,
  onEditFact,
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
  /** Create a new family member from an unmatched person and link them. */
  onCreateMember?: (entityIndex: number, name: string) => Promise<boolean>;
  onEditCategory: (category: string) => void;
  onEditDate: (entityIndex: number, date: string) => void;
  onEditTaskDueDate: (taskIndex: number, dueDate: string) => void;
  onEditFact: (factIndex: number, value: string) => void;
  onDeleteTask: (taskIndex: number) => void;
  onResolveDisambiguation: (entityIndex: number, memberId: string) => void;
  onConfirm: () => void;
  onReanalyze: () => void;
  className?: string;
}) {
  const activeTasks = analysis.tasks
    .map((t, i) => ({ task: t, index: i }))
    .filter(({ index }) => !edits.deletedTasks.has(index));
  const typeLabel =
    DOCUMENT_TYPE_LABELS[analysis.document_type] ?? "Dokument";
  const primaryPerson = analysis.family_members[0]?.name;
  const detailHeading = primaryPerson
    ? `${typeLabel} für ${primaryPerson}`
    : typeLabel;

  return (
    <div
      data-testid="review-card"
      data-needs-review={needsReview}
      className={className}
    >
      <div className="mb-5 rounded-ordilo-md bg-[var(--sand)]/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--mist-dark)]">
              Ordilo hat erkannt
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-tight text-foreground">
              {detailHeading}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-foreground">
                {typeLabel}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-[var(--mist-dark)]">
                {analysis.suggested_category}
              </span>
            </div>
          </div>

          {needsReview && (
            <span
              data-testid="review-needed-badge"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-[var(--apricot)]"
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Überprüfung nötig
            </span>
          )}
        </div>

        {shouldRenderSummary(analysis.summary, needsReview) && (
          <div data-testid="review-summary" className="mt-3">
            <p className="max-w-[60ch] text-sm leading-relaxed text-[var(--mist-dark)]">
              {analysis.summary}
            </p>
          </div>
        )}

        {hasUnresolvedDisambiguation && (
          <div className="mt-4 pt-1">
            <DisambiguationPrompt
              lowConfidencePersons={lowConfidencePersons}
              familyMembers={familyMembers}
              onResolve={onResolveDisambiguation}
            />
          </div>
        )}
      </div>

      {/* Fields — one flat, dense list; every row shares the same hairline
          divider regardless of which field type it belongs to (VAL-REVIEW
          compact restyle). */}
      <div className="divide-y divide-border/60">
        {/* Persons */}
        {analysis.family_members.length > 0 && (
          <FieldGroup testId="review-persons">
            {analysis.family_members.map((member, i) => {
              const edited = edits.persons.get(i);
              const isEdited = Boolean(edited);
              const displayName = edited?.name ?? member.name;
              const isUnmatched =
                !edited && !member.person_id && Boolean(onCreateMember);
              return (
                <FieldRow
                  key={i}
                  icon={User}
                  label="Personen"
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
                  <span className="block truncate">{displayName}</span>
                  {isUnmatched && (
                    <CreateMemberButton
                      name={member.name}
                      onCreate={() => onCreateMember!(i, member.name)}
                    />
                  )}
                </FieldRow>
              );
            })}
          </FieldGroup>
        )}

        {/* Organizations */}
        {analysis.organizations.length > 0 && (
          <FieldGroup testId="review-organizations">
            {analysis.organizations.map((org, i) => (
              <FieldRow
                key={i}
                icon={Building2}
                label="Organisationen"
                confidence={org.confidence}
              >
                <span className="block truncate">{org.name}</span>
                {org.type && org.type !== "organization" && (
                  <span className="block truncate font-normal text-muted-foreground">
                    {org.type}
                  </span>
                )}
              </FieldRow>
            ))}
          </FieldGroup>
        )}

        {/* Dates */}
        {analysis.dates.length > 0 && (
          <FieldGroup testId="review-dates">
            {analysis.dates.map((date, i) => {
              const edited = edits.dates.get(i);
              const isEdited = Boolean(edited);
              const displayDate = edited ?? date.date;
              const formatted = formatGermanDate(displayDate) || displayDate;
              return (
                <FieldRow
                  key={i}
                  icon={Calendar}
                  label="Datum"
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
                  <span className="block truncate">{formatted}</span>
                  {date.label && (
                    <span className="block truncate font-normal text-muted-foreground">
                      {date.label}
                    </span>
                  )}
                </FieldRow>
              );
            })}
          </FieldGroup>
        )}

        {/* Amounts */}
        {analysis.amounts.length > 0 && (
          <FieldGroup testId="review-amounts">
            {analysis.amounts.map((amount, i) => (
              <FieldRow
                key={i}
                icon={Euro}
                label="Beträge"
                confidence={amount.confidence}
              >
                <span className="block truncate">
                  {amount.amount} {amount.currency}
                </span>
                {amount.label && (
                  <span className="block truncate font-normal text-muted-foreground">
                    {amount.label}
                  </span>
                )}
              </FieldRow>
            ))}
          </FieldGroup>
        )}

        {/* Facts — exact identifiers (serial numbers, contract numbers, …).
            Shown monospaced so single-character OCR errors are easy to
            spot, with a one-tap correction input. */}
        {analysis.facts.length > 0 && (
          <FieldGroup testId="review-facts">
            {analysis.facts.map((fact, i) => {
              const edited = edits.factValues.get(i);
              const isEdited = Boolean(edited);
              const displayValue = edited ?? fact.value;
              const typeLabel =
                FACT_TYPE_LABELS[fact.fact_type] ?? FACT_TYPE_LABELS.other;
              return (
                <FieldRow
                  key={i}
                  icon={Hash}
                  label="Nummern & Kennungen"
                  testId={`review-fact-${i}`}
                  confidence={fact.confidence}
                  isEdited={isEdited}
                  editControl={
                    <FactEditControl
                      value={displayValue}
                      label={fact.label || typeLabel}
                      onChange={(v) => onEditFact(i, v)}
                    />
                  }
                >
                  <span className="block truncate font-mono">{displayValue}</span>
                  <span className="block truncate font-normal text-muted-foreground">
                    {fact.label || typeLabel}
                  </span>
                </FieldRow>
              );
            })}
          </FieldGroup>
        )}

        {/* Tasks */}
        {activeTasks.length > 0 && (
          <FieldGroup testId="review-tasks">
            {activeTasks.map(({ task, index }) => {
              const editedDueDate = edits.taskDueDates.get(index);
              const isEdited = Boolean(editedDueDate);
              const displayDueDate = editedDueDate ?? task.due_date;
              const priorityLabel = getPriorityLabel(task.priority);
              return (
                <FieldRow
                  key={index}
                  icon={ListTodo}
                  label="Aufgaben"
                  testId={`review-task-${index}`}
                  confidence={task.confidence}
                  editControl={
                    <button
                      type="button"
                      onClick={() => onDeleteTask(index)}
                      className="flex size-7 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      aria-label="Aufgabe löschen"
                      data-testid={`delete-task-${index}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  }
                >
                  <p className="text-foreground">{task.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-normal">
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
                </FieldRow>
              );
            })}
          </FieldGroup>
        )}

        {/* Empty tasks state */}
        {analysis.tasks.length > 0 && activeTasks.length === 0 && (
          <p className="py-2.5 text-sm text-muted-foreground">
            Alle Aufgaben wurden entfernt.
          </p>
        )}

        {/* Category */}
        <FieldRow
          icon={Tag}
          label="Kategorie"
          testId="review-category"
          isEdited={edits.category !== null}
          editControl={
            <CategoryEditControl
              value={edits.category ?? analysis.suggested_category}
              existingCategories={existingCategories}
              onChange={onEditCategory}
            />
          }
        >
          <span className="block truncate">
            {edits.category ?? analysis.suggested_category}
          </span>
        </FieldRow>

        {/* Tags are deliberately NOT rendered — they are invisible search
            fuel (stored + indexed), not something a person needs to review.
            One visible order: the category (= Sammlung) above. */}
      </div>

      {/* Confirm error */}
      {confirmError && (
        <div className="mt-4 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{confirmError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="sticky bottom-0 z-10 mt-5 -mx-4 bg-[var(--background)]/95 px-4 pt-4 pb-1 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/88">
        <div className="flex flex-col gap-2.5">
        <Button
          type="button"
          size="lg"
          onClick={onConfirm}
          disabled={confirming || hasUnresolvedDisambiguation}
          className="h-12 rounded-ordilo-md w-full"
          data-testid="confirm-button"
        >
          {confirming ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Wird gespeichert …
            </>
          ) : hasUnresolvedDisambiguation ? (
            <>
              <AlertCircle className="size-4" aria-hidden="true" />
              Bitte Person wählen
            </>
          ) : (
            <>
              <Check className="size-4" aria-hidden="true" />
              Ins Familienbuch übernehmen
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
          Nochmal lesen
        </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline "create as family member" suggestion for an extracted person who
 * matched nobody in the family — the graph grows from the documents.
 */
function CreateMemberButton({
  name,
  onCreate,
}: {
  name: string;
  onCreate: () => Promise<boolean>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  if (state === "done") {
    return (
      <span
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--petrol)]"
        data-testid="create-member-done"
      >
        <Check className="size-3" aria-hidden="true" />
        {name} ist jetzt Teil der Familie
      </span>
    );
  }

  return (
    <span className="mt-1 block font-normal">
      <button
        type="button"
        disabled={state === "saving"}
        onClick={async () => {
          setState("saving");
          const ok = await onCreate().catch(() => false);
          setState(ok ? "done" : "error");
        }}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--petrol)] underline-offset-2 hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
        data-testid="create-member-button"
      >
        {state === "saving" ? (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Wird angelegt …
          </>
        ) : (
          <>
            <UserPlus className="size-3" aria-hidden="true" />
            {`„${name}" als Familienmitglied anlegen`}
          </>
        )}
      </button>
      {state === "error" && (
        <span className="ml-2 text-xs text-destructive">
          Das hat nicht geklappt.
        </span>
      )}
    </span>
  );
}
