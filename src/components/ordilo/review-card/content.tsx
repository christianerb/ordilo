import { useRef, useState } from "react";
import {
  Check,
  RefreshCw,
  AlertCircle,
  Calendar,
  CalendarPlus,
  Tag,
  User,
  Building2,
  ContactRound,
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
  DEFAULT_FACT_LABEL,
  type DocumentAnalysis,
} from "@/lib/schemas/extraction";
import { formatGermanDate } from "@/lib/format";
import { findCalendarCandidates } from "@/lib/calendar-heuristics";
import { cn } from "@/lib/utils";
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
  mode = "review",
  analysis,
  edits,
  familyMembers,
  existingCategories,
  needsReview,
  hasUnresolvedDisambiguation,
  lowConfidencePersons,
  confirming,
  confirmError,
  onEditTitle,
  onEditSummary,
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
  onCancel,
  onReanalyze,
  documentId,
  onViewOriginal,
  onBack,
  onToggleCalendarDate,
  className,
}: {
  /**
   * "review" — the document is not in the family book yet; the primary
   * action adds it. "edit" — it already is, and the primary action saves
   * the correction. Tasks and numbers are read-only in edit mode: both
   * are owned elsewhere (the task list keeps its own status and assignee,
   * numbers are written row by row from the calm confirmed view), and
   * this screen's save does not touch either table.
   */
  mode?: "review" | "edit";
  analysis: DocumentAnalysis;
  edits: EditState;
  familyMembers: FamilyMemberOption[];
  existingCategories: string[];
  needsReview: boolean;
  hasUnresolvedDisambiguation: boolean;
  lowConfidencePersons: { member: DocumentAnalysis["family_members"][0]; index: number }[];
  confirming: boolean;
  confirmError: string | null;
  /** Correct the document title (what every list and search result shows). */
  onEditTitle?: (value: string) => void;
  /** Correct the summary ("Worum geht's"). */
  onEditSummary?: (value: string) => void;
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
  /** "Abbrechen" — leaves edit mode and drops unsaved corrections. */
  onCancel?: () => void;
  onReanalyze: () => void;
  /** Document ID — when provided, enables original-file comparison. */
  documentId?: string;
  onViewOriginal?: (sourceText?: string) => void;
  /** "Zurück" — returns to the summary view (scan wizard only). */
  onBack?: () => void;
  /**
   * Flip a date's planner toggle ("In den Familienplaner legen?"). The
   * next selected state is computed by the caller, so this component
   * stays free of override-vs-default bookkeeping.
   */
  onToggleCalendarDate?: (dateIndex: number, nextSelected: boolean) => void;
  className?: string;
}) {
  const isEditMode = mode === "edit";
  const activeTasks = analysis.tasks
    .map((t, i) => ({ task: t, index: i }))
    .filter(({ index }) => !edits.deletedTasks.has(index));
  // The planner offer: future dates Ordilo can put straight into the
  // Familienplaner. Computed from the EDITED dates, so a date the user
  // just fixed is offered (and later created) in its corrected form.
  // Edit mode skips it — a confirmed document's planner entries already
  // exist, and this screen's save deliberately leaves them alone.
  const calendarCandidates = isEditMode
    ? []
    : findCalendarCandidates(
        analysis.dates.map((d, i) => ({
          date: edits.dates.get(i) ?? d.date,
          label: d.label,
        })),
      );
  const calendarCandidateIndices = new Set(
    calendarCandidates.map((candidate) => candidate.index),
  );
  const documentTitle = edits.title ?? analysis.title;
  const documentSummary = edits.summary ?? analysis.summary;
  const titleMissing = isEditMode && !documentTitle.trim();
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
              {isEditMode ? "Angaben ändern" : "Auf einen Blick"}
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

        {/* In edit mode the two fields that name a document — its title and
            its one-line description — are plain, always-open inputs. They
            are the reason people open the sheet to correct something, and
            hiding them behind a pencil would make the edit screen look
            like it edits everything except what you came for. */}
        {isEditMode && onEditTitle && (
          <label className="mt-4 block" data-testid="review-title-edit">
            <span className="text-xs font-medium text-[var(--mist-dark)]">
              Titel
            </span>
            <input
              type="text"
              value={documentTitle}
              onChange={(event) => onEditTitle(event.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-ordilo-sm border border-border bg-card px-2.5 py-2 text-base text-foreground focus-ring sm:text-sm"
              data-testid="review-title-input"
            />
            {titleMissing && (
              <span className="mt-1 block text-xs text-destructive">
                Ohne Titel findet ihr das Dokument später schwer wieder.
              </span>
            )}
          </label>
        )}

        {isEditMode && onEditSummary && (
          <label className="mt-3 block" data-testid="review-summary-edit">
            <span className="text-xs font-medium text-[var(--mist-dark)]">
              Worum geht&apos;s?
            </span>
            <textarea
              value={documentSummary}
              onChange={(event) => onEditSummary(event.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-ordilo-sm border border-border bg-card px-2.5 py-2 text-base leading-relaxed text-foreground focus-ring sm:text-sm"
              data-testid="review-summary-input"
            />
          </label>
        )}

        {!isEditMode && shouldRenderSummary(analysis.summary, needsReview) && (
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

        {(analysis.contacts?.length ?? 0) > 0 && (
          <ReviewFieldSection
            icon={ContactRound}
            title="Kontaktdaten"
            testId="review-contacts"
          >
            {analysis.contacts!.map((contact, index) => (
              <FieldRow
                key={`${contact.name}-${index}`}
                confidence={contact.confidence}
                sourceText={contact.phone || contact.email}
                onShowSource={onViewOriginal}
              >
                <span className="block truncate">{contact.name}</span>
                {(contact.organization || contact.role) && (
                  <span className="block truncate font-normal text-muted-foreground">
                    {[contact.organization, contact.role].filter(Boolean).join(" · ")}
                  </span>
                )}
                {contact.phone && (
                  <span className="block truncate font-normal text-[var(--petrol)]">
                    {contact.phone}
                  </span>
                )}
                {contact.email && (
                  <span className="block truncate font-normal text-[var(--petrol)]">
                    {contact.email}
                  </span>
                )}
              </FieldRow>
            ))}
          </ReviewFieldSection>
        )}

        {/* Planner offer — the moment Ordilo works ahead: future dates
            are offered as Familienplaner entries before the family even
            asks. Appointments start checked, deadlines (which live on
            their task's due date) start unchecked. */}
        {calendarCandidates.length > 0 && (
          <section
            data-testid="review-calendar-offer"
            className="mb-4 rounded-ordilo-md bg-[var(--sand-warm)]/60 p-4"
          >
            <div className="flex items-start gap-2.5">
              <CalendarPlus
                className="mt-0.5 size-4 shrink-0 text-[var(--petrol)]"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {calendarCandidates.length === 1
                    ? "Da steht ein Termin drin."
                    : `Da stehen ${calendarCandidates.length} Termine drin.`}
                </p>
                <p className="mt-0.5 text-sm text-[var(--mist-dark)]">
                  {calendarCandidates.length === 1
                    ? "Soll ich ihn direkt in euren Familienplaner legen?"
                    : "Soll ich sie direkt in euren Familienplaner legen?"}
                </p>
              </div>
            </div>
            <ul className="mt-2">
              {calendarCandidates.map((candidate) => {
                const displayDate = edits.dates.get(candidate.index) ?? candidate.date;
                const formatted = formatGermanDate(displayDate) || displayDate;
                const selected =
                  edits.calendarDates.get(candidate.index) ??
                  candidate.defaultSelected;
                return (
                  <li
                    key={candidate.index}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() =>
                        onToggleCalendarDate?.(candidate.index, !selected)
                      }
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-ordilo-sm px-2 py-1.5 text-left transition-colors hover:bg-[var(--warm-white)]/70 focus-ring"
                      data-testid={`calendar-toggle-${candidate.index}`}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                          selected
                            ? "border-[var(--petrol)] bg-[var(--petrol)] text-[var(--warm-white)]"
                            : "border-[var(--mist-light)] bg-transparent",
                        )}
                        aria-hidden="true"
                      >
                        {selected && (
                          <Check className="size-3" strokeWidth={3} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {formatted}
                        </span>
                        {candidate.label && (
                          <span className="block truncate text-xs text-[var(--mist-dark)]">
                            {candidate.label}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-[var(--mist-dark)]">
                        {selected ? "Kommt in den Planer" : "Nicht übernehmen"}
                      </span>
                    </button>
                    <DateEditControl
                      value={displayDate}
                      label={candidate.label}
                      onChange={(d) => onEditDate(candidate.index, d)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Dates — the ones NOT offered to the planner (past dates like
            "Gezahlt am …"); candidates live in the offer above. */}
        {analysis.dates.some((_, i) => !calendarCandidateIndices.has(i)) && (
          <ReviewFieldSection
            icon={Calendar}
            title="Wichtige Termine"
            testId="review-dates"
          >
            {analysis.dates.map((date, i) => {
              if (calendarCandidateIndices.has(i)) return null;
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
            spot, with a one-tap correction input.

            In edit mode they are read-only: a confirmed document's numbers
            are corrected row by row in the calm view, which writes them
            straight to `document_facts` (this screen's save deliberately
            leaves that table alone, so an edit here would look saved and
            silently revert). */}
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
              const factLabel = fact.label || DEFAULT_FACT_LABEL;
              return (
                <FieldRow
                  key={i}
                  testId={`review-fact-${i}`}
                  confidence={fact.confidence}
                  isEdited={isEdited}
                  sourceText={fact.value}
                  onShowSource={onViewOriginal}
                  editControl={
                    isEditMode ? undefined : (
                      <FactEditControl
                        value={displayValue}
                        label={factLabel}
                        onChange={(v) => onEditFact(i, v)}
                      />
                    )
                  }
                >
                  <span className="block truncate font-mono">{displayValue}</span>
                  <span className="block truncate font-normal text-muted-foreground">
                    {factLabel}
                  </span>
                </FieldRow>
              );
            })}
            {isEditMode && (
              <p className="py-2 text-xs text-muted-foreground">
                Nummern korrigierst du in der Übersicht — dort werden sie
                sofort gespeichert.
              </p>
            )}
          </ReviewFieldSection>
        )}

        {/* Tasks */}
        {activeTasks.length > 0 && (
          <ReviewFieldSection
            icon={ListTodo}
            title="Das müsst ihr noch erledigen"
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
                    isEditMode ? undefined : (
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
                          className="flex size-11 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-ring"
                          aria-label="Aufgabe löschen"
                          title="Aufgabe löschen"
                          data-testid={`delete-task-${index}`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    )
                  }
                >
                  <p className="text-foreground">{displayTitle}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-normal">
                    {displayDueDate && (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="size-3.5" aria-hidden="true" />
                        {formatGermanDate(displayDueDate) || displayDueDate}
                        {!isEditMode && (
                          <DateEditControl
                            value={displayDueDate}
                            label="Frist"
                            onChange={(d) => onEditTaskDueDate(index, d)}
                            compact
                          />
                        )}
                      </span>
                    )}
                    {!isEditMode && !displayDueDate && (
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-ordilo-sm px-2 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--petrol)]/10 focus-ring"
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
            className="inline-flex items-center gap-1.5 rounded-ordilo-sm text-sm font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-ring"
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
          disabled={confirming || hasUnresolvedDisambiguation || titleMissing}
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
              {isEditMode ? "Änderungen speichern" : "Angaben übernehmen"}
            </>
          )}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onCancel}
            disabled={confirming}
            className="h-12 w-full rounded-ordilo-md"
            data-testid="review-cancel-button"
          >
            Abbrechen
          </Button>
        )}
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
            className="mx-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-ring rounded-ordilo-sm"
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
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--petrol)] underline-offset-2 hover:underline disabled:opacity-60 focus-ring rounded-ordilo-sm"
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