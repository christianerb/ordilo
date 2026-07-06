"use client";

import Link from "next/link";
import { Check, Calendar, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPriorityLabel,
  getPriorityBadgeClasses,
  getPriorityBadgeStyle,
} from "@/lib/task-utils";
import { formatGermanDate } from "@/lib/format";
import { ConfidenceBadge } from "@/components/ordilo/confidence-badge";
import type { TaskRow } from "@/lib/task-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The task data needed by the TaskCard, extending the raw task row with
 * an optional document title for the source-document link.
 *
 * `document_id` is overridden to `string | null` to handle edge cases
 * where a task might not have a linked document (VAL-TASKS-004).
 */
export interface TaskCardData extends Omit<TaskRow, "document_id"> {
  /** The ID of the source document, or null when the task has no document. */
  document_id: string | null;
  /** Title of the source document, or null when not available. */
  document_title?: string | null;
}

/**
 * Props for the TaskCard component.
 */
export interface TaskCardProps {
  /** The task to display. */
  task: TaskCardData;
  /** Called when the checkbox is toggled. Receives the new status: "done" or "open". */
  onToggleDone?: (newStatus: string) => void;
  /** Called when the dismiss button is activated. */
  onDismiss?: () => void;
  /** Optional additional className. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Task Card — displays a single family task with a checkbox, title, due
 * date (German format), priority badge (color-coded), and a link to the
 * source document.
 *
 * Features:
 * - Checkbox: toggles task between "open" and "done" (calls onToggleDone)
 * - Title: shown with strikethrough when the task is done
 * - Due date: displayed in German format (DD.MM.YYYY) with a calendar icon;
 *   omitted when no due date is set
 * - Priority badge: color-coded (high=apricot, medium=petrol, low=muted)
 * - Source document link: navigates to /scan?doc={document_id}
 * - Dismiss button: calls onDismiss (shown for open tasks only)
 *
 * Visual design:
 * - Warm card surface (sand) with 20px radius and soft shadow
 * - 20-28px border radius, warm color palette
 * - Mobile-friendly layout (horizontal flex, no overflow)
 *
 * @example
 * <TaskCard
 *   task={task}
 *   onToggleDone={(newStatus) => updateTaskStatus(task.id, newStatus)}
 *   onDismiss={() => dismissTask(task.id)}
 * />
 */
export function TaskCard({
  task,
  onToggleDone,
  onDismiss,
  className,
}: TaskCardProps) {
  const isDone = task.status === "done";
  const isOpen = task.status === "open";
  const dueDate = formatGermanDate(task.due_date);
  const hasDocument = Boolean(task.document_id);

  const handleToggle = () => {
    if (onToggleDone) {
      onToggleDone(isDone ? "open" : "done");
    }
  };

  return (
    <div
      data-testid="task-card"
      data-status={task.status}
      data-priority={task.priority}
      className={cn(
        "flex items-start gap-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card transition-all",
        className,
      )}
    >
      {/* Checkbox — circular, custom-styled to match the warm design */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? "Aufgabe als offen markieren" : "Aufgabe als erledigt markieren"}
        onClick={handleToggle}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isDone
            ? "border-[var(--petrol)] bg-[var(--petrol)]"
            : "border-[var(--mist)] bg-transparent hover:border-[var(--petrol)]",
        )}
        data-testid="task-checkbox"
      >
        {isDone && (
          <Check
            className="size-4 text-white"
            strokeWidth={3}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Main content: title, due date, priority badge */}
      <div className="min-w-0 flex-1">
        {/* Title */}
        <p
          className={cn(
            "font-medium text-foreground",
            isDone && "text-muted-foreground line-through",
          )}
          data-testid="task-title"
        >
          {task.title}
        </p>

        {/* Due date + priority badge row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {dueDate && (
            <span
              className="inline-flex items-center gap-1 text-sm text-muted-foreground"
              data-testid="task-due-date"
            >
              <Calendar
                className="size-3.5"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              Fällig {dueDate}
            </span>
          )}

          {/* Priority badge */}
          <span
            data-testid="priority-badge"
            data-priority={task.priority}
            className={cn(
              "inline-flex items-center rounded-ordilo-pill px-2 py-0.5 text-xs font-medium",
              getPriorityBadgeClasses(task.priority),
            )}
            style={getPriorityBadgeStyle(task.priority)}
          >
            {getPriorityLabel(task.priority)}
          </span>

          {/* Confidence badge — shown when confidence > 0 (VAL-DESIGN-008) */}
          {task.confidence > 0 && (
            <ConfidenceBadge
              confidence={task.confidence}
              data-testid="task-confidence-badge"
            />
          )}
        </div>

        {/* Source document link */}
        {hasDocument && (
          <Link
            href={`/scan?doc=${task.document_id}`}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="task-document-link"
          >
            <FileText
              className="size-3.5"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            {task.document_title?.trim()
              ? task.document_title
              : "Zum Dokument"}
          </Link>
        )}
      </div>

      {/* Dismiss button — shown for open tasks only */}
      {isOpen && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-ordilo-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Aufgabe verwerfen"
          data-testid="task-dismiss-button"
        >
          <X
            className="size-4"
            aria-hidden="true"
            strokeWidth={2}
          />
        </button>
      )}
    </div>
  );
}
