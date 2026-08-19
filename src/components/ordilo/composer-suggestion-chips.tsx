"use client";

import { useSuggestionChips } from "@/lib/search/suggestion-chips-context";

export function ComposerSuggestionChips({
  onSelect,
}: {
  onSelect: (query: string) => void;
}) {
  const chips = useSuggestionChips();
  if (chips.length === 0) return null;

  return (
    <div className="animate-card-in motion-reduce:animate-none">
      <p className="mb-1.5 text-xs font-medium text-[var(--mist-dark)]">
        Häufig gefragt
      </p>
      <div
        data-testid="suggestion-chips"
        className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            className="shrink-0 rounded-full border border-border/70 bg-[var(--surface-box)] px-3 py-1.5 text-xs font-medium text-[var(--mist-dark)] transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-ring"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
