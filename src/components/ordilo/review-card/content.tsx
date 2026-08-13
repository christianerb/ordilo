import { useRef, useState } from "react";
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
  ArrowLeft,
  Undo2,
} from "lucide-react";
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
  shouldRenderSummary,
  FieldRow,
  EditedTag,
  DisambiguationPrompt,
  ReviewFieldSection,
} from "./helpers";
import {
  CategoryEditControl,
  DateEditControl,
  FactEditControl,
  TextEditControl,
  FieldEditButton,
} from "./edit-controls";
import {
  PersonPicker,
  unmatchedPersonName,
} from "@/components/ordilo/person-picker";

function shouldShowOrganizationType(name: string, type?: string | null): boolean {
  if (!type) return false;
  const normalize = (value: string) =>
    value.toLocaleLowerCase("de").replace(/[^a-z0-9äöüß]+/g, " ").trim();
  const normalizedType = normalize(type);
  return (
    normalizedType !== "organization" &&
    normalizedType !== "organisation" &&
    normalizedType !== normalize(name)
  );
}

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
  onEditOrganization,
  onEditAmount,
  onEditTaskTitle,
  onEditTaskDueDate,
  onEditFact,
  onDeleteTask,
  onUndoDeleteTask,
  onResolveDisambiguation,
  onConfirm,
  onReanalyze,
  documentId,
  onViewOriginal,
  onBack,
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
  onEditOrganization: (entityIndex: number, value: string) => void;
  onEditAmount: (entityIndex: number, value: string) => void;
  onEditTaskTitle: (taskIndex: number, value: string) => void;
  onEditTaskDueDate: (taskIndex: number, dueDate: string) => void;
  onEditFact: (factIndex: number, value: string) => void;
  onDeleteTask: (taskIndex: number) => void;
  onUndoDeleteTask: () => void;
  onResolveDisambiguation: (entityIndex: number, memberId: string | null) => void;
  onConfirm: () => void;
  onReanalyze: () => void;
  /** Document ID — when provided, enables original-file comparison. */
  documentId?: string;
  onViewOriginal?: (sourceText?: string) => void;
  /** "Zurück" — returns to the summary view (scan wizard only). */
  onBack?: () => void;
  className?: string;
}) {
  const activeTasks = analysis.tasks
    .map((t, i) => ({ task: t, index: i }))
    .filter(({ index }) => !edits.deletedTasks.has(index));
  const typeLabel = DOCUMENT_TYPE_LABELS[analysis.document_type] ?? "Dokument";
  const primaryPerson =
    edits.persons.get(0)?.name ?? analysis.family_members[0]?.name;
  const contextLabel = primaryPerson ? `${typeLabel} für ${primaryPerson}` : typeLabel;
  const firstDate = analysis.dates[0];
  const firstAmount = analysis.amounts[0];
  const firstTaskEntry = activeTasks[0];
  const firstTask = firstTaskEntry?.task;
  const firstDateValue = edits.dates.get(0) ?? firstDate?.date;
  const firstAmountValue = edits.amountValues.get(0) ?? firstAmount?.amount;
  const firstTaskTitle = firstTaskEntry
    ? edits.taskTitles.get(firstTaskEntry.index) ?? firstTaskEntry.task.title
    : null;

  return (
    <div
      data-testid="review-card"
      data-needs-review={needsReview}
      className={className}
    >
      <div className="mb-5 rounded-ordilo-md bg-[var(--sand)]/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-tight text-foreground">
              Auf einen Blick
            </h3>
            <p className="mt-1 text-sm text-[var(--mist-dark)]">{contextLabel}</p>
          </div>

          {needsReview && (
            <span
              data-testid="review-needed-badge"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-[var(--apricot-text)]"
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

        {(firstDate || firstAmount || firstTask) && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--mist-dark)]">
            {firstDate && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1.5">
                <Calendar className="size-3.5" aria-hidden="true" />
                {formatGermanDate(firstDateValue) || firstDateValue}
              </span>
            )}
            {firstAmount && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1.5">
                <Euro className="size-3.5" aria-hidden="true" />
                {firstAmountValue} {firstAmount.currency}
              </span>
            )}
            {firstTask && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1.5">
                <ListTodo className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{firstTaskTitle}</span>
              </span>
            )}
          </div>
        )}

        {hasUnresolvedDisambiguation && (
          <div className="mt-4 pt-1">
            <DisambiguationPrompt
              lowConfidencePersons={lowConfidencePersons}
              familyMembers={familyMembers}
              onResolve={onResolveDisambiguation}
              onCreateMember={onCreateMember}
            />
          </div>
        )}
      </div>

      <div>
        {/* Persons */}
        {analysis.family_members.length > 0 && (
          <ReviewFieldSection icon={User} title="Personen" testId="review-persons">
            {analysis.family_members.map((member, i) => (
              <PersonFieldRow
                key={i}
                member={member}
                edited={edits.persons.get(i)}
                familyMembers={familyMembers}
                onEditPerson={(memberId) => onEditPerson(i, memberId)}
                onCreateMember={
                  onCreateMember
                    ? (name) => onCreateMember(i, name)
                    : undefined
                }
                onViewOriginal={onViewOriginal}
              />
            ))}
          </ReviewFieldSection>
        )}

        {/* No person recognized at all — still let the user assign or
            create one. Previously this case rendered no person UI at all,
            a dead end for documents the OCR read as person-less. The edit
            is stored at index 0 (beyond the empty extracted list) and
            appended to the confirm payload by buildConfirmPayload. */}
        {analysis.family_members.length === 0 &&
          (familyMembers.length > 0 || onCreateMember) && (
            <ReviewFieldSection icon={User} title="Personen" testId="review-persons">
              <div className="py-3" data-testid="review-person-add">
                <p className="text-sm text-muted-foreground">
                  Keine Person erkannt — gehört das Dokument zu jemandem?
                </p>
                <PersonPicker
                  className="mt-2"
                  familyMembers={familyMembers}
                  value={
                    edits.persons.has(0)
                      ? edits.persons.get(0)!.personId
                      : undefined
                  }
                  onChange={(memberId) => onEditPerson(0, memberId)}
                  onCreate={
                    onCreateMember
                      ? (name) => onCreateMember(0, name)
                      : undefined
                  }
                  testIdPrefix="person-add"
                />
              </div>
            </ReviewFieldSection>
          )}

        {/* Organizations */}
        {analysis.organizations.length > 0 && (
          <ReviewFieldSection
            icon={Building2}
            title="Organisationen"
            testId="review-organizations"
          >
            {analysis.organizations.map((org, i) => {
              const editedName = edits.organizationNames.get(i);
              const displayName = editedName ?? org.name;
              return (
                <FieldRow
                  key={i}
                  confidence={org.confidence}
                  sourceText={org.name}
                  onShowSource={onViewOriginal}
                  isEdited={Boolean(editedName)}
                  editControl={
                    <TextEditControl
                      value={displayName}
                      label="Organisation korrigieren"
                      onChange={(value) => onEditOrganization(i, value)}
                      testId="organization-edit"
                    />
                  }
                >
                  <span className="block truncate">{displayName}</span>
                  {shouldShowOrganizationType(displayName, org.type) && (
                    <span className="block truncate font-normal text-muted-foreground">
                      {org.type}
                    </span>
                  )}
                </FieldRow>
              );
            })}
          </ReviewFieldSection>
        )}

        {/* Dates */}
        {analysis.dates.length > 0 && (
          <ReviewFieldSection
            icon={Calendar}
            title="Wichtige Termine"
            testId="review-dates"
          >
            {analysis.dates.map((date, i) => {
              const edited = edits.dates.get(i);
              const isEdited = Boolean(edited);
              const displayDate = edited ?? date.date;
              const formatted = formatGermanDate(displayDate) || displayDate;
              return (
                <FieldRow
                  key={i}
                  confidence={date.confidence}
                  sourceText={date.date}
                  onShowSource={onViewOriginal}
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
          </ReviewFieldSection>
        )}

        {/* Amounts */}
        {analysis.amounts.length > 0 && (
          <ReviewFieldSection icon={Euro} title="Beträge" testId="review-amounts">
            {analysis.amounts.map((amount, i) => {
              const editedValue = edits.amountValues.get(i);
              const displayValue = editedValue ?? amount.amount;
              return (
                <FieldRow
                  key={i}
                  confidence={amount.confidence}
                  sourceText={amount.amount}
                  onShowSource={onViewOriginal}
                  isEdited={Boolean(editedValue)}
                  editControl={
                    <TextEditControl
                      value={displayValue}
                      label="Betrag korrigieren"
                      onChange={(value) => onEditAmount(i, value)}
                      testId="amount-edit"
                      inputMode="decimal"
                    />
                  }
                >
                  <span className="block truncate">
                    {displayValue} {amount.currency}
                  </span>
                  {amount.label && (
                    <span className="block truncate font-normal text-muted-foreground">
                      {amount.label}
                    </span>
                  )}
                </FieldRow>
              );
            })}
          </ReviewFieldSection>
        )}

        {/* Facts — exact identifiers (serial numbers, contract numbers, …).
            Shown monospaced so single-character OCR errors are easy to
            spot, with a one-tap correction input. */}
        {analysis.facts.length > 0 && (
          <ReviewFieldSection
            icon={Hash}
            title="Nummern & Kennungen"
            testId="review-facts"
          >
            {analysis.facts.map((fact, i) => {
              const edited = edits.factValues.get(i);
              const isEdited = Boolean(edited);
              const displayValue = edited ?? fact.value;
              const typeLabel =
                FACT_TYPE_LABELS[fact.fact_type] ?? FACT_TYPE_LABELS.other;
              return (
                <FieldRow
                  key={i}
                  testId={`review-fact-${i}`}
                  confidence={fact.confidence}
                  isEdited={isEdited}
                  sourceText={fact.value}
                  onShowSource={onViewOriginal}
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
          </ReviewFieldSection>
        )}

        {/* Tasks */}
        {activeTasks.length > 0 && (
          <ReviewFieldSection
            icon={ListTodo}
            title={`Nächste Schritte (${activeTasks.length})`}
            testId="review-tasks"
          >
            {activeTasks.map(({ task, index }) => {
              const editedDueDate = edits.taskDueDates.get(index);
              const editedTitle = edits.taskTitles.get(index);
              const isEdited = Boolean(editedDueDate || editedTitle);
              const displayDueDate = editedDueDate ?? task.due_date;
              const displayTitle = editedTitle ?? task.title;
              return (
                <FieldRow
                  key={index}
                  testId={`review-task-${index}`}
                  confidence={task.confidence}
                  sourceText={task.title}
                  onShowSource={onViewOriginal}
                  editControl={
                    <div className="flex items-center gap-0.5">
                      <TextEditControl
                        value={displayTitle}
                        label="Aufgabe korrigieren"
                        onChange={(value) => onEditTaskTitle(index, value)}
                        testId="task-title-edit"
                      />
                      <button
                        type="button"
                        onClick={() => onDeleteTask(index)}
                        className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        aria-label="Aufgabe löschen"
                        title="Aufgabe löschen"
                        data-testid={`delete-task-${index}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  }
                >
                  <p className="text-foreground">{displayTitle}</p>
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
                    {isEdited && <EditedTag />}
                  </div>
                </FieldRow>
              );
            })}
          </ReviewFieldSection>
        )}

        {/* Empty tasks state */}
        {analysis.tasks.length > 0 && activeTasks.length === 0 && (
          <p className="py-2.5 text-sm text-muted-foreground">
            Alle Aufgaben wurden entfernt.
          </p>
        )}

        {edits.deletedTasks.size > 0 && (
          <button
            type="button"
            onClick={onUndoDeleteTask}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-ordilo-sm px-2 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="undo-delete-task"
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Letzte Aufgabe wiederherstellen
          </button>
        )}

        {/* Category */}
        <FieldRow
          icon={Tag}
          label="Sammlung"
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

      {/* Confirm error — announced, because a failed confirm (including the
          20s timeout) was completely silent to a screen reader. */}
      {confirmError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-ordilo-sm border border-destructive/20 bg-destructive/5 p-3"
        >
          <p className="text-sm text-destructive">{confirmError}</p>
        </div>
      )}

      {documentId && onViewOriginal && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => onViewOriginal()}
            className="inline-flex items-center gap-1.5 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="review-view-original"
          >
            Original vergleichen
          </button>
        </div>
      )}

      {/* Actions */}
      <div
        className="sticky bottom-0 z-10 mt-5 -mx-4 bg-[var(--background)]/95 px-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/88"
        style={{
          paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))",
        }}
      >
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
              Angaben übernehmen
            </>
          )}
        </Button>
        {onBack && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onBack}
            disabled={confirming}
            className="h-12 rounded-ordilo-md w-full"
            data-testid="review-back-button"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Zurück
          </Button>
        )}
        {onReanalyze && (
          <button
            type="button"
            onClick={onReanalyze}
            disabled={confirming}
            className="mx-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
            data-testid="reanalyze-button"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Nochmal lesen
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
/**
 * One extracted person, with the assignment editor behind a pencil.
 *
 * The pencil reveals the same chip picker the review summary uses, so
 * assigning is one tap in both places. It stays behind the pencil here
 * because this view lists every field at once and always-on chip rows for
 * each person would drown the "nothing to change" case.
 */
function PersonFieldRow({
  member,
  edited,
  familyMembers,
  onEditPerson,
  onCreateMember,
  onViewOriginal,
}: {
  member: DocumentAnalysis["family_members"][0];
  edited: { name: string; personId: string | null } | undefined;
  familyMembers: FamilyMemberOption[];
  onEditPerson: (memberId: string | null) => void;
  onCreateMember?: (name: string) => Promise<boolean>;
  onViewOriginal?: (sourceText: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const pencilRef = useRef<HTMLButtonElement>(null);

  /**
   * Close the picker and put focus back on the pencil. Without the second
   * part the trigger unmounts under the user's focus and a keyboard user
   * lands on <body>, having to tab in from the top of the review again.
   */
  const closePicker = () => {
    setIsEditing(false);
    requestAnimationFrame(() => pencilRef.current?.focus());
  };

  // An edit with an empty name means "explicitly assigned to nobody".
  const isNone = Boolean(edited) && edited!.name === "";
  const displayName = isNone ? member.name : (edited?.name ?? member.name);
  // undefined = nothing assigned yet, so no chip is preselected.
  const assignedId = edited
    ? (isNone ? null : edited.personId)
    : (member.person_id ?? undefined);
  const createName = edited
    ? null
    : unmatchedPersonName(member.name, member.person_id, familyMembers);
  // With no family members at all there is nothing to pick behind the
  // pencil — show the picker inline instead, so its create path (the
  // only way forward) is visible rather than hidden.
  const pickerOpen = isEditing || familyMembers.length === 0;

  return (
    <FieldRow
      confidence={member.confidence}
      sourceText={member.name}
      onShowSource={onViewOriginal}
      isEdited={Boolean(edited)}
      editControl={
        pickerOpen ? undefined : (
          <FieldEditButton
            buttonRef={pencilRef}
            onClick={() => setIsEditing(true)}
            label="Person ändern"
            testId="person-edit-button"
          />
        )
      }
    >
      <span className="block truncate">{displayName}</span>
      {isNone && (
        <span className="block truncate font-normal text-muted-foreground">
          Wird keiner Person zugeordnet
        </span>
      )}
      {pickerOpen ? (
        <PersonPicker
          className="mt-2"
          familyMembers={familyMembers}
          value={assignedId}
          onChange={(memberId) => {
            onEditPerson(memberId);
            closePicker();
          }}
          createName={createName}
          onCreate={
            onCreateMember
              ? async (name) => {
                  const ok = await onCreateMember(name);
                  // The creation already linked the entity to the new
                  // member — the picker's job is done.
                  if (ok) closePicker();
                  return ok;
                }
              : undefined
          }
          // An always-on picker (empty family) has nothing to dismiss to.
          onDismiss={familyMembers.length === 0 ? undefined : closePicker}
          testIdPrefix="person-edit"
        />
      ) : (
        createName &&
        onCreateMember && (
          <CreateMemberButton
            name={createName}
            onCreate={() => onCreateMember(createName)}
          />
        )
      )}
    </FieldRow>
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