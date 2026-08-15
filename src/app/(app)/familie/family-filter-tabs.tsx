"use client";

import { Smile, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FamilyFilter } from "./family-filters";

const TABS: { key: FamilyFilter; label: string; icon: typeof Users }[] = [
  { key: "all", label: "Alle", icon: Users },
  { key: "adults", label: "Erwachsene", icon: User },
  { key: "children", label: "Kinder", icon: Smile },
];

export function FamilyFilterTabs({
  value,
  onChange,
}: {
  value: FamilyFilter;
  onChange: (value: FamilyFilter) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Nach Alter filtern"
      className="flex flex-1 items-center gap-1 rounded-full border border-border bg-card p-1"
    >
      {TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            value === key
              ? "bg-[var(--wash-sage)] text-[var(--petrol)]"
              : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`family-filter-${key}`}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
