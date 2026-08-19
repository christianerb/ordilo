"use client";

import { cn } from "@/lib/utils";

export interface OrdiloFilterTabItem<T extends string> {
  key: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  testId?: string;
}

/**
 * OrdiloFilterTabs — a segmented filter control in a single pill.
 *
 * Shared by the Familie and Dokumente views so both filter rows share one
 * shape: one rounded container, segments inside, the active segment in a
 * sage wash. Apricot stays reserved for the nav's "you are here".
 *
 * With few tabs the segments grow to fill the width (flex-1); with many
 * the container scrolls horizontally so labels stay readable.
 */
export function OrdiloFilterTabs<T extends string>({
  value,
  onChange,
  tabs,
  ariaLabel,
  testId,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: OrdiloFilterTabItem<T>[];
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
      className="flex flex-1 items-center gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(({ key, label, icon: Icon, testId: tabTestId }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition-colors focus-ring",
            value === key
              ? "bg-[var(--wash-sage)] text-[var(--petrol)]"
              : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={tabTestId}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}
