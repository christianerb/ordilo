"use client";

import { useState } from "react";
import { CalendarOff, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { DateInput } from "@/components/ordilo/date-input";
import {
  formatTaskDayHint,
  resolveSchedulePreset,
  TASK_SCHEDULE_PRESET_LABELS,
  todayLocalDate,
  type TaskSchedulePreset,
} from "@/lib/task-utils";
import { cn } from "@/lib/utils";

/** The presets offered, in the order a family reaches for them. */
const PRESETS: TaskSchedulePreset[] = [
  "today",
  "tomorrow",
  "weekend",
  "next-week",
];

export interface TaskScheduleSheetProps {
  /** The task being rescheduled — null keeps the sheet inert. */
  task: { id: string; title: string; due_date: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Commit a new due date (null = kein Termin). Called once, immediately —
   * this sheet has no save button, because "wann?" is a single decision and
   * asking twice is what made the old flow feel heavy.
   */
  onSelect: (dueDate: string | null) => void;
}

/**
 * "Wann ist das dran?" — the replacement for dragging a row into a column.
 *
 * Dragging guessed at the answer (dropping into "Diese Woche" meant
 * *tomorrow*; dropping into "Später" wiped the date). Every option here
 * says which day it means, is reachable with one thumb, and lands exactly
 * where it says.
 */
export function TaskScheduleSheet({
  task,
  open,
  onOpenChange,
  onSelect,
}: TaskScheduleSheetProps) {
  // Read on every render, never memoized: a sheet left mounted overnight
  // must not still offer yesterday as "Heute".
  const todayStr = todayLocalDate();
  const [customDate, setCustomDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetCustom = () => {
    setCustomDate("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetCustom();
    onOpenChange(next);
  };

  // Closes through the resetting handler, never past it: the sheet stays
  // mounted between tasks, so a date left in the field would greet the next
  // task as if it were its own.
  const commit = (dueDate: string | null) => {
    onSelect(dueDate);
    handleOpenChange(false);
  };

  /**
   * A typed date is only usable once it is complete and not in the past.
   *
   * `DateInput` applies `minDate` to the calendar's days but reports every
   * parseable keystroke through `onChange`, so this field cannot lean on it
   * for either check: committing there would move a task into the past —
   * which the create and detail forms both refuse — and would snap the
   * sheet shut the moment a half-typed date happened to parse.
   */
  const customDateIsPast = Boolean(customDate) && customDate < todayStr;
  const canApplyCustomDate = Boolean(customDate) && !customDateIsPast;

  const handleCustomChange = (value: string) => {
    setCustomDate(value);
    setError(
      value && value < todayStr
        ? "Bitte wähle heute oder einen späteren Tag."
        : null,
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-ordilo-md bg-[var(--surface-box)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        showCloseButton={false}
        data-testid="task-schedule-sheet"
      >
        <SheetHeader className="px-0 pt-1 pb-4">
          <SheetTitle className="text-base font-semibold">
            Wann ist das dran?
          </SheetTitle>
          <SheetDescription className="truncate text-sm">
            {task?.title ?? ""}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => {
            const date = resolveSchedulePreset(preset, todayStr);
            const selected = task ? task.due_date === date : false;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => commit(date)}
                aria-pressed={selected}
                className={cn(
                  "press-scale flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-ordilo-sm border px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected
                    ? "border-[var(--petrol)]/30 bg-[var(--petrol)]/10"
                    : "border-border bg-[var(--surface-story)] hover:bg-secondary",
                )}
                data-testid={`task-schedule-${preset}`}
              >
                <span className="flex w-full items-center gap-1.5 text-sm font-medium text-foreground">
                  {TASK_SCHEDULE_PRESET_LABELS[preset]}
                  {selected && (
                    <Check
                      className="ml-auto size-4 shrink-0 text-[var(--petrol)]"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTaskDayHint(date)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <label
            htmlFor="task-schedule-custom"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Anderer Tag
          </label>
          <DateInput
            id="task-schedule-custom"
            value={customDate}
            onChange={handleCustomChange}
            // A day tapped in the calendar is a finished decision, and days
            // before today are disabled there — so that path commits at
            // once, like the presets above it.
            onPickDate={(iso) => {
              if (iso >= todayStr) commit(iso);
            }}
            minDate={todayStr}
            className="h-12"
            aria-label="Anderer Tag"
            data-testid="task-schedule-custom"
          />
          {error && (
            <p
              className="mt-2 text-xs text-destructive"
              role="alert"
              data-testid="task-schedule-error"
            >
              {error}
            </p>
          )}
          {canApplyCustomDate && (
            <button
              type="button"
              onClick={() => commit(customDate)}
              className="press-scale mt-2 flex min-h-11 w-full items-center justify-center rounded-ordilo-sm bg-[var(--petrol)] px-4 text-sm font-medium text-[var(--warm-white)] transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="task-schedule-apply"
            >
              Auf {formatTaskDayHint(customDate)} verschieben
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => commit(null)}
          className="mt-3 flex min-h-12 w-full items-center gap-2.5 rounded-ordilo-sm px-3.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="task-schedule-none"
        >
          <CalendarOff className="size-4 shrink-0" aria-hidden="true" />
          {TASK_SCHEDULE_PRESET_LABELS.none}
        </button>
      </SheetContent>
    </Sheet>
  );
}
