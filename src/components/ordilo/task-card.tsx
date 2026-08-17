"use client";

import Link from "next/link";
import { CalendarClock, CalendarDays, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";
import {
  formatOverdueLabel,
  formatTaskDueLabel,
  todayLocalDate,
  type TaskRow,
} from "@/lib/task-utils";
import { CardActions } from "@/components/ordilo/card-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MemberAvatar } from "@/components/ordilo/member-avatar";
import { OrdiloAccordion } from "@/components/ordilo/ordilo-accordion";
import { useDocumentViewer } from "@/lib/scan/scan-context";
import { vibrate } from "@/lib/haptics";

export interface TaskCardData extends Omit<TaskRow, "document_id"> {
  document_id: string | null;
  document_title?: string | null;
  linked_documents?: { id: string; title: string | null }[];
  assigned_member_name?: string | null;
}

export interface AssigneeOption {
  id: string;
  name: string;
  role: string | null;
  /** Member accent color (hex) used e.g. for calendar markers. */
  avatar_color?: string | null;
}

/** The assignee as the card shows them: a face and a name. */
export interface TaskAssigneeDisplay {
  name: string | null;
  color?: string | null;
  /** Ready-to-use (signed) photo URL; omitted falls back to the initial. */
  photoUrl?: string | null;
}

export interface TaskCardProps {
  task: TaskCardData;
  onToggleDone?: (newStatus: string) => void;
  onDismiss?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  /** Open the "Wann?" sheet — adds "Verschieben" to the row menu. */
  onSchedule?: () => void;
  /**
   * Open the member picker. Turns the assignee avatar into a button, which
   * is what makes "wer macht was" a one-tap answer instead of a trip
   * through the detail sheet.
   */
  onAssign?: () => void;
  className?: string;
  showConfidence?: boolean;
  /**
   * Who the task belongs to, with their face. Without it the card falls
   * back to the plain assignee name it already carries.
   */
  assignee?: TaskAssigneeDisplay;
  /** Flat row inside a grouped surface: no own card chrome (background,
      shadow, radius) — the parent surface carries those, and a divider
      separates the rows. */
  flat?: boolean;
  /** Label for the delete/dismiss menu item. Defaults to "Löschen". */
  deleteLabel?: string;
}

export function TaskCard({
  task,
  onToggleDone,
  onDismiss,
  onEdit,
  onDelete,
  onClick,
  onSchedule,
  onAssign,
  className,
  flat = false,
  deleteLabel = "Löschen",
  assignee,
}: TaskCardProps) {
  const { openDocument } = useDocumentViewer();
  const isDone = task.status === "done";
  const isOpen = task.status === "open";
  const todayStr = todayLocalDate();
  // "Heute", "Morgen", "Do" — the long date only once it is far enough
  // away that a weekday would be ambiguous.
  const dueLabel = formatTaskDueLabel(task.due_date, todayStr);
  const dueTitle = formatGermanDate(task.due_date) ?? undefined;
  // Overdue = open task whose due date is in the past (local calendar
  // day). The row says how late it is ("seit 3 Tagen") in apricot; that
  // is the per-task urgency signal, and it is more use than the date it
  // replaces, which the title attribute still carries.
  const overdueLabel = isOpen
    ? formatOverdueLabel(task.due_date, todayStr)
    : null;
  const isOverdue = overdueLabel !== null;
  const isDueToday = isOpen && task.due_date === todayStr;
  const hasDocument = Boolean(task.document_id);
  const assigneeName = assignee?.name ?? task.assigned_member_name ?? null;
  const hasMeta = Boolean(dueLabel || hasDocument);
  // A task carries four things that matter: what, who, when, and the
  // detail that makes it doable ("im Sekretariat abgeben, nicht in den
  // Briefkasten"). The first three were on the row; the note was editable
  // but invisible, so the only way to find out a task had one was to open
  // every task. One clamped line puts the content itself on the row —
  // more use than an icon hinting that content exists. Finished tasks drop
  // it again: the Erledigt list is scanned, not read.
  const noteLine = isDone ? null : task.description?.trim() || null;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDone) vibrate(10);
    onToggleDone?.(isDone ? "open" : "done");
  };

  return (
    <div
      data-testid="task-card"
      data-status={task.status}
      role="group"
      className={cn(
        "flex items-start gap-1.5",
        flat ? "py-2.5" : "rounded-ordilo-sm bg-card p-3 shadow-card card-lift",
        isDone && "animate-task-done",
        className,
      )}
    >
      {/* Abhaken — the most repeated action on the screen, so it gets the
          largest target and sits under the thumb's natural resting spot. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={
          isDone
            ? "Aufgabe als offen markieren"
            : "Aufgabe als erledigt markieren"
        }
        onClick={handleToggle}
        className="press-scale -ml-1 flex size-11 shrink-0 items-center justify-center rounded-full transition-transform hover:[&>span]:border-[var(--petrol)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid="task-checkbox"
      >
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full border-2 transition-colors",
            isDone
              ? "border-[var(--petrol)] bg-[var(--petrol)]"
              : "border-[var(--mist)] bg-transparent",
          )}
          aria-hidden="true"
        >
          {isDone && (
            <Check
              className="size-3.5 animate-check-pop text-[var(--warm-white)]"
              strokeWidth={3}
            />
          )}
        </span>
      </button>

      <div className="min-w-0 flex-1 py-1">
        <TaskSummary
          task={task}
          isDone={isDone}
          isOverdue={isOverdue}
          isDueToday={isDueToday}
          dueLabel={dueLabel}
          overdueLabel={overdueLabel}
          dueTitle={dueTitle}
          noteLine={noteLine}
          hasMeta={hasMeta}
          onClick={onClick}
        />
        <TaskDetails task={task} />
      </div>

      {/* Wer macht's — a face on every row, tappable where reassigning is
          allowed. An empty dashed circle is a standing invitation: a task
          nobody has taken on is the one thing a family plan must not hide. */}
      <TaskAssigneeControl
        assignee={assignee}
        assigneeName={assigneeName}
        isDone={isDone}
        onAssign={onAssign}
      />

      {/* Row menu — the visible counterpart to the swipe gestures, plus the
          destructive action that deliberately has no gesture. */}
      {(onEdit || onDelete || onSchedule || (isOpen && onDismiss)) && (
        <CardActions
          onEdit={onEdit}
          onDelete={onDelete ?? (isOpen ? onDismiss : undefined)}
          deleteLabel={deleteLabel}
          className="size-11"
          extraItems={
            onSchedule && isOpen ? (
              <DropdownMenuItem
                onClick={onSchedule}
                data-testid="card-action-schedule"
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                Verschieben
              </DropdownMenuItem>
            ) : undefined
          }
          testId="task-card-actions"
        />
      )}

      {/* Document link — sr-only for accessibility */}
      {hasDocument && (
        <Link
          href={`/dokumente?doc=${task.document_id}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (task.document_id) {
              void openDocument(task.document_id);
            }
          }}
          className="sr-only"
          data-testid="task-document-link"
        >
          {task.document_title?.trim() || "Zum Dokument"}
        </Link>
      )}
    </div>
  );
}

/**
 * The assignee slot: a button where the card can reassign, a plain face
 * where it cannot, and nothing at all for a finished task nobody owned.
 */
function TaskAssigneeControl({
  assignee,
  assigneeName,
  isDone,
  onAssign,
}: {
  assignee?: TaskAssigneeDisplay;
  assigneeName: string | null;
  isDone: boolean;
  onAssign?: () => void;
}) {
  if (!onAssign) {
    if (!assigneeName) return null;
    return (
      <span
        className={cn("mt-1 shrink-0", isDone && "opacity-50")}
        title={assigneeName}
        data-testid="task-assignee"
      >
        <MemberAvatar
          name={assigneeName}
          color={assignee?.color}
          photoUrl={assignee?.photoUrl}
          size="md"
        />
        <span className="sr-only">Zuständig: {assigneeName}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAssign();
      }}
      title={assigneeName ? `Zuständig: ${assigneeName}` : "Niemand zuständig"}
      aria-label={
        assigneeName
          ? `Zuständig: ${assigneeName}. Jemand anderem zuweisen`
          : "Niemand zuständig. Jemandem zuweisen"
      }
      className={cn(
        "press-scale flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isDone && "opacity-50",
      )}
      data-testid="task-assignee"
    >
      {assigneeName ? (
        <MemberAvatar
          name={assigneeName}
          color={assignee?.color}
          photoUrl={assignee?.photoUrl}
          size="md"
        />
      ) : (
        <span
          className="flex size-8 items-center justify-center rounded-full border border-dashed border-[var(--mist)] text-[var(--mist-dark)]"
          aria-hidden="true"
        >
          <UserPlus className="size-4" strokeWidth={1.75} />
        </span>
      )}
    </button>
  );
}

function TaskSummary({
  task,
  isDone,
  isOverdue,
  isDueToday,
  dueLabel,
  overdueLabel,
  dueTitle,
  noteLine,
  hasMeta,
  onClick,
}: {
  task: TaskCardData;
  isDone: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  dueLabel: string | null;
  overdueLabel: string | null;
  dueTitle: string | undefined;
  noteLine: string | null;
  hasMeta: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      {/* Title */}
      <p
        className={cn(
          "line-clamp-2 text-sm font-medium leading-snug text-foreground",
          isDone && "animate-strike text-muted-foreground line-through",
        )}
        data-testid="task-title"
      >
        {task.title}
      </p>

      {/* Note — the detail that makes the task doable */}
      {noteLine && (
        <p
          className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-muted-foreground"
          data-testid="task-note"
        >
          {noteLine}
        </p>
      )}

      {/* Meta — when it is due, and where it came from */}
      {hasMeta && (
        <div
          className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"
          data-testid="task-meta"
        >
          {dueLabel && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                isOverdue
                  ? "font-medium text-[var(--apricot-text)]"
                  : isDueToday
                    ? "font-medium text-[var(--petrol)]"
                    : "text-muted-foreground",
              )}
              title={dueTitle}
              data-testid="task-due-date"
            >
              {isOverdue ? (
                <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {overdueLabel ?? dueLabel}
            </span>
          )}
          {hasDocumentMeta(task) && (
            <>
              {dueLabel && <span aria-hidden="true">·</span>}
              <span className="min-w-0 truncate">
                {task.document_title?.trim() || "Ohne Titel"}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-ordilo-sm text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={`Aufgabe öffnen: ${task.title}`}
    >
      {content}
    </button>
  ) : (
    content
  );
}

function TaskDetails({ task }: { task: TaskCardData }) {
  const description = task.description?.trim();
  const linkedDocuments = task.linked_documents ?? [];
  if (!description && linkedDocuments.length === 0) return null;

  return (
    <OrdiloAccordion
      title="Details"
      description={
        linkedDocuments.length > 0
          ? `${linkedDocuments.length} verknüpfte Dokumente`
          : undefined
      }
      className="mt-2"
      contentClassName="space-y-3"
      testId="task-details"
    >
      {description && (
        <p className="text-sm leading-relaxed text-[var(--mist-dark)]">
          {description}
        </p>
      )}
      {linkedDocuments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Verknüpfte Dokumente
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-foreground">
            {linkedDocuments.map((document) => (
              <li key={document.id} className="truncate">
                {document.title?.trim() || "Ohne Titel"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </OrdiloAccordion>
  );
}

/** Whether the task carries a source document worth naming in the meta line. */
function hasDocumentMeta(task: TaskCardData): boolean {
  return Boolean(task.document_id);
}
