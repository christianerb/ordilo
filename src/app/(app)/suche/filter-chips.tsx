import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterType = "person" | "category" | "document_type";

export interface ActiveFilter {
  type: FilterType;
  value: string;
  label: string;
}

export function FilterChips({
  facets,
  activeFilters,
  onToggle,
  onClearAll,
}: {
  facets: {
    personChips: Array<{ value: string; label: string }>;
    categoryChips: Array<{ value: string; label: string }>;
    docTypeChips: Array<{ value: string; label: string }>;
  };
  activeFilters: ActiveFilter[];
  onToggle: (type: FilterType, value: string, label: string) => void;
  onClearAll: () => void;
}) {
  const isActive = (type: FilterType, value: string) =>
    activeFilters.some((f) => f.type === type && f.value === value);

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div
      data-testid="filter-chips"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-3"
    >
      {facets.personChips.map((chip) => (
        <FilterChip
          key={`person-${chip.value}`}
          label={chip.label}
          active={isActive("person", chip.value)}
          onClick={() => onToggle("person", chip.value, chip.label)}
        />
      ))}

      {facets.categoryChips.map((chip) => (
        <FilterChip
          key={`category-${chip.value}`}
          label={chip.label}
          active={isActive("category", chip.value)}
          onClick={() => onToggle("category", chip.value, chip.label)}
        />
      ))}

      {facets.docTypeChips.map((chip) => (
        <FilterChip
          key={`doctype-${chip.value}`}
          label={chip.label}
          active={isActive("document_type", chip.value)}
          onClick={() => onToggle("document_type", chip.value, chip.label)}
        />
      ))}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Filter zurücksetzen"
        >
          <X className="size-3" aria-hidden="true" />
          Zurücksetzen
        </button>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "border-[var(--petrol)] bg-[var(--petrol)] text-white"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {active && <X className="size-3" aria-hidden="true" />}
      {label}
    </button>
  );
}
