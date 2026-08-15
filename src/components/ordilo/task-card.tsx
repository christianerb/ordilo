"use client";

import Link from "next/link";
import { CalendarDays, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";
import {
  formatTaskDueLabel,
  todayLocalDate,
  type TaskRow,
} from "@/lib/task-utils";
import { CardActions } from "@/components/ordilo/card-actions";
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
  // day). This is the per-card urgency signal — apricot marks it as a
  // high-priority item wherever the card appears (Heute, /aufgaben).
  const isOverdue =
    isOpen && task.due_date !== null && task.due_date < todayStr;
  const isDueToday = isOpen && task.due_date === todayStr;
  const hasDocument = Boolean(task.document_id);
  const assigneeName = assignee?.name ?? task.assigned_member_name ?? null;
  const hasMeta = Boolean(dueLabel || hasDocument || assigneeName);

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
        "flex items-start gap-2.5",
        flat
          ? "py-3"
          : "rounded-ordilo-sm bg-card p-3 shadow-card card-lift",
        isDone && "animate-task-done",
        className,
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? "Aufgabe als offen markieren" : "Aufgabe als erledigt markieren"}
        onClick={handleToggle}
        className="mt-[-0.25rem] flex size-11 shrink-0 items-center justify-center rounded-full transition-transform press-scale hover:[&>span]:border-[var(--petrol)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
            <Check className="size-3.5 text-[var(--warm-white)] animate-check-pop" strokeWidth={3} />
          )}
        </span>
      </button>

      {/* Content — button opens the detail sheet when onClick is provided */}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
          aria-label={`Aufgabe öffnen: ${task.title}`}
        >
          <CardContent
            task={task}
            isDone={isDone}
            isOverdue={isOverdue}
            isDueToday={isDueToday}
            dueLabel={dueLabel}
            dueTitle={dueTitle}
            assignee={assignee}
            assigneeName={assigneeName}
            hasMeta={hasMeta}
          />
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <CardContent
            task={task}
            isDone={isDone}
            isOverdue={isOverdue}
            isDueToday={isDueToday}
            dueLabel={dueLabel}
            dueTitle={dueTitle}
            assignee={assignee}
            assigneeName={assigneeName}
            hasMeta={hasMeta}
          />
        </div>
      )}

      {/* Card actions menu ("..." → edit / delete) */}
      {(onEdit || onDelete || (isOpen && onDismiss)) && (
        <CardActions
          onEdit={onEdit}
          onDelete={onDelete ?? (isOpen ? onDismiss : undefined)}
          deleteLabel={deleteLabel}
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

function CardContent({
  task,
  isDone,
  isOverdue,
  isDueToday,
  dueLabel,
  dueTitle,
  assignee,
  assigneeName,
  hasMeta,
}: {
  task: TaskCardData;
  isDone: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  dueLabel: string | null;
  dueTitle: string | undefined;
  assignee?: TaskAssigneeDisplay;
  assigneeName: string | null;
  hasMeta: boolean;
}) {
  return (
    <>
      {/* Title */}
      <p
        className={cn(
          "line-clamp-2 text-sm font-medium leading-snug text-foreground",
          isDone && "text-muted-foreground line-through animate-strike",
        )}
        data-testid="task-title"
      >
        {task.title}
      </p>

      {/* Meta — when it is due, and whose it is */}
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
                  ? "font-medium text-destructive"
                  : isDueToday
                    ? "font-medium text-[var(--petrol)]"
                    : "text-muted-foreground",
              )}
              title={dueTitle}
              data-testid="task-due-date"
            >
              <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
              {dueLabel}
            </span>
          )}
          {assigneeName && (
            <>
              {dueLabel && <span aria-hidden="true">·</span>}
              <span
                className="inline-flex min-w-0 items-center gap-1.5"
                data-testid="task-assignee"
              >
                <MemberAvatar
                  name={assigneeName}
                  color={assignee?.color}
                  photoUrl={assignee?.photoUrl}
                  size="sm"
                />
                <span className="truncate">{assigneeName}</span>
              </span>
            </>
          )}
          {hasDocumentMeta(task) && (
            <>
              {(dueLabel || assigneeName) && <span aria-hidden="true">·</span>}
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
