"use client";

import { useState } from "react";
import { CalendarOff, Check } from "lucide-react";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";
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

  const commit = (dueDate: string | null) => {
    onSelect(dueDate);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setCustomDate("");
    onOpenChange(next);
  };

  return (
    <OrdiloDrawer
      variant="picker"
      open={open}
      onOpenChange={handleOpenChange}
      data-testid="task-schedule-sheet"
    >
      <OrdiloDrawerHeader
        title="Wann ist das dran?"
        description={task?.title ?? ""}
      />

      <OrdiloDrawerBody>
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
                  "press-scale flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-ordilo-sm border px-3.5 py-2 text-left transition-colors focus-ring",
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
            onChange={(value) => {
              setCustomDate(value);
              if (value) commit(value);
            }}
            minDate={todayStr}
            className="h-12"
            aria-label="Anderer Tag"
            data-testid="task-schedule-custom"
          />
        </div>

        <button
          type="button"
          onClick={() => commit(null)}
          className="mt-3 flex min-h-12 w-full items-center gap-2.5 rounded-ordilo-sm px-3.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-ring"
          data-testid="task-schedule-none"
        >
          <CalendarOff className="size-4 shrink-0" aria-hidden="true" />
          {TASK_SCHEDULE_PRESET_LABELS.none}
        </button>
      </OrdiloDrawerBody>
    </OrdiloDrawer>
  );
}
