"use client";

import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTER_ACTIVE, FILTER_TOGGLE_INACTIVE } from "@/lib/ui-styles";

/**
 * The round "Weitere Filter" toggle button that sits beside a filter row.
 *
 * `active` controls the visual state (colored when the panel is open or
 * other filters are engaged); `open` drives `aria-expanded`. They are
 * separate because a panel can be closed while a filter it hides is still
 * active — the button stays colored to signal "there's something in here".
 */
export function MoreFiltersButton({
  active,
  open,
  onClick,
  testId,
}: {
  active: boolean;
  open: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label="Weitere Filter"
      title="Weitere Filter"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-ring",
        active ? FILTER_ACTIVE : FILTER_TOGGLE_INACTIVE,
      )}
      data-testid={testId}
    >
      <SlidersHorizontal className="size-4.5" aria-hidden="true" />
    </button>
  );
}
