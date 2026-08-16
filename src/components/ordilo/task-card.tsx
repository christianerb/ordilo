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

      {/* Content — button opens the detail sheet when onClick is provided */}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 rounded-ordilo-sm py-1 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={`Aufgabe öffnen: ${task.title}`}
        >
          <CardContent
            task={task}
            isDone={isDone}
            isOverdue={isOverdue}
            isDueToday={isDueToday}
            dueLabel={dueLabel}
            overdueLabel={overdueLabel}
            dueTitle={dueTitle}
            hasMeta={hasMeta}
          />
        </button>
      ) : (
        <div className="min-w-0 flex-1 py-1">
          <CardContent
            task={task}
            isDone={isDone}
            isOverdue={isOverdue}
            isDueToday={isDueToday}
            dueLabel={dueLabel}
            overdueLabel={overdueLabel}
            dueTitle={dueTitle}
            hasMeta={hasMeta}
          />
        </div>
      )}

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

function CardContent({
  task,
  isDone,
  isOverdue,
  isDueToday,
  dueLabel,
  overdueLabel,
  dueTitle,
  hasMeta,
}: {
  task: TaskCardData;
  isDone: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  dueLabel: string | null;
  overdueLabel: string | null;
  dueTitle: string | undefined;
  hasMeta: boolean;
}) {
  return (
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
}

/** Whether the task carries a source document worth naming in the meta line. */
function hasDocumentMeta(task: TaskCardData): boolean {
  return Boolean(task.document_id);
}
