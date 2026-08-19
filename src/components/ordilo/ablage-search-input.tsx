"use client";

import { Search } from "lucide-react";

export function AblageSearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-12 w-full rounded-full border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground shadow-card placeholder:text-muted-foreground focus-ring"
        data-testid={testId}
      />
    </div>
  );
}
