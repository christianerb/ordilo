"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";
import type { TaskRow } from "@/lib/task-utils";
import { CardActions } from "@/components/ordilo/card-actions";
import { useDocumentViewer } from "@/lib/scan/scan-context";

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
  /** Label for the delete/dismiss menu item. Defaults to "Löschen". */
  deleteLabel?: string;
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[var(--warm-apricot)]",
  medium: "bg-[var(--petrol)]",
  low: "bg-[var(--mist)]",
};

export function TaskCard({
  task,
  onToggleDone,
  onDismiss,
  onEdit,
  onDelete,
  onClick,
  className,
  deleteLabel = "Löschen",
}: TaskCardProps) {
  const { openDocument } = useDocumentViewer();
  const isDone = task.status === "done";
  const isOpen = task.status === "open";
  const dueDate = formatGermanDate(task.due_date);
  // Overdue = open task whose due date is in the past (local calendar
  // day). This is the per-card urgency signal — apricot marks it as a
  // high-priority item wherever the card appears (Heute, /aufgaben).
  const isOverdue =
    isOpen &&
    task.due_date !== null &&
    task.due_date < new Date().toLocaleDateString("sv-SE");
  const hasDocument = Boolean(task.document_id);
  const prioDot = PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.medium;
  const hasMeta = Boolean(dueDate || hasDocument || Boolean(task.assigned_member_name));

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleDone?.(isDone ? "open" : "done");
  };

  return (
    <div
      data-testid="task-card"
      data-status={task.status}
      data-priority={task.priority}
      role="group"
      className={cn(
        "flex items-start gap-2.5 rounded-ordilo-sm bg-card p-3 shadow-card card-lift",
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
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all press-scale focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isDone
            ? "border-[var(--petrol)] bg-[var(--petrol)]"
            : "border-[var(--mist)] bg-transparent hover:border-[var(--petrol)]",
        )}
        data-testid="task-checkbox"
      >
        {isDone && (
          <Check className="size-3 text-white animate-check-pop" strokeWidth={3} aria-hidden="true" />
        )}
      </button>

      {/* Content — button opens the detail sheet when onClick is provided */}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
          aria-label={`Aufgabe öffnen: ${task.title}`}
        >
          <CardContent task={task} isDone={isDone} isOverdue={isOverdue} dueDate={dueDate} prioDot={prioDot} hasMeta={hasMeta} />
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <CardContent task={task} isDone={isDone} isOverdue={isOverdue} dueDate={dueDate} prioDot={prioDot} hasMeta={hasMeta} />
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
  dueDate,
  prioDot,
  hasMeta,
}: {
  task: TaskCardData;
  isDone: boolean;
  isOverdue: boolean;
  dueDate: string | false | null;
  prioDot: string;
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

      {/* Meta — dot + plain text, no pills or icons */}
      {hasMeta && (
        <div
          className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="task-meta"
        >
          <span
            className={cn("size-1.5 shrink-0 rounded-full", prioDot)}
            aria-hidden="true"
          />
          {dueDate && (
            <span
              className={cn(
                "tabular-nums",
                isOverdue && "font-medium text-[var(--apricot)]",
              )}
              data-testid="task-due-date"
            >
              {isOverdue ? `Überfällig · ${dueDate}` : dueDate}
            </span>
          )}
          {Boolean(task.document_id) && dueDate && <span className="text-muted-foreground">·</span>}
          {Boolean(task.document_id) && (
            <span className="truncate text-muted-foreground">
              {task.document_title?.trim() || "Ohne Titel"}
            </span>
          )}
          {task.assigned_member_name && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="truncate text-muted-foreground" data-testid="task-assignee">
                {task.assigned_member_name}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
