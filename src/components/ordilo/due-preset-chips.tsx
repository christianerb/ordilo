"use client";

import { cn } from "@/lib/utils";
import { FILTER_ACTIVE } from "@/lib/ui-styles";
import {
  formatTaskDayHint,
  resolveSchedulePreset,
  TASK_SCHEDULE_PRESET_LABELS,
  todayLocalDate,
  type TaskSchedulePreset,
} from "@/lib/task-utils";

/** The quick "wann?" answers offered above the date field. */
const DUE_PRESETS: TaskSchedulePreset[] = ["today", "tomorrow", "weekend"];

/**
 * The "Heute / Morgen / Wochenende" preset chips above a date input.
 *
 * Shared by the task-create and task-detail sheets so both offer the same
 * shortcuts with the same shape. When `toggle` is true (create), tapping
 * the active preset clears the date; when false (detail), tapping always
 * sets it.
 */
export function DuePresetChips({
  value,
  onChange,
  testIdPrefix,
  toggle = false,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  testIdPrefix: string;
  toggle?: boolean;
  children?: React.ReactNode;
}) {
  const todayStr = todayLocalDate();

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {DUE_PRESETS.map((preset) => {
        const date = resolveSchedulePreset(preset, todayStr);
        const selected = Boolean(date) && value === date;
        return (
          <button
            key={preset}
            type="button"
            onClick={() => {
              if (toggle && selected) onChange("");
              else onChange(date ?? "");
            }}
            aria-pressed={selected}
            title={formatTaskDayHint(date) ?? undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-ring",
              selected
                ? FILTER_ACTIVE
                : "border-border bg-[var(--surface-box)] text-muted-foreground hover:text-foreground",
            )}
            data-testid={`${testIdPrefix}-due-${preset}`}
          >
            {TASK_SCHEDULE_PRESET_LABELS[preset]}
          </button>
        );
      })}
      {children}
    </div>
  );
}
