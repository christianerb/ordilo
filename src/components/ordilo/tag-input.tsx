"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { Check, Tag, X } from "lucide-react";

/**
 * TagInput — a chip-based tag editor.
 *
 * Typing a comma (or pressing Enter) immediately converts the current text
 * into a pill-shaped tag, so tags visually "pop in" as the user types
 * instead of staying as raw comma-separated text. Pasting a comma-separated
 * string (e.g. "Autokennzeichen, Versicherungsnummer") also splits into
 * multiple tags at once. Backspace on an empty input removes the last tag.
 */
export interface TagInputProps {
  /** The current tags. */
  value: string[];
  /** Called with the updated tag list whenever a tag is added or removed. */
  onChange: (tags: string[]) => void;
  /** Placeholder for the text input. */
  placeholder?: string;
  disabled?: boolean;
  /** Test id for the outer container (defaults to "tag-input"). */
  testId?: string;
  /**
   * "boxed" (default) renders a bordered card-style input, matching the
   * other form fields on the family/inventory forms. "minimal" renders a
   * borderless input that only gains a bottom border on focus, matching
   * the compact task-detail-sheet style.
   */
  variant?: "boxed" | "minimal";
}

export function TagInput({
  value,
  onChange,
  placeholder = "Stichwort hinzufügen…",
  disabled = false,
  testId = "tag-input",
  variant = "boxed",
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = useCallback(
    (raw: string) => {
      const parts = raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (parts.length === 0) return;
      const next = [...value];
      let changed = false;
      for (const part of parts) {
        if (!next.includes(part)) {
          next.push(part);
          changed = true;
        }
      }
      if (changed) onChange(next);
    },
    [value, onChange],
  );

  const handleChange = useCallback(
    (raw: string) => {
      // A comma commits everything before it as tag(s) immediately, so the
      // chip appears the moment the user types the separator, not only
      // after Enter.
      if (raw.includes(",")) {
        const lastPart = raw.slice(raw.lastIndexOf(",") + 1);
        commit(raw);
        setDraft(lastPart);
        return;
      }
      setDraft(raw);
    },
    [commit],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit(draft);
        setDraft("");
      } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
        onChange(value.slice(0, -1));
      }
    },
    [commit, draft, value, onChange],
  );

  const handleAddClick = useCallback(() => {
    commit(draft);
    setDraft("");
  }, [commit, draft]);

  return (
    <div data-testid={testId}>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" data-testid={`${testId}-tags`}>
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground"
            >
              <Tag className="size-2.5" aria-hidden="true" strokeWidth={2} />
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--mist-light)]"
                aria-label={`Stichwort "${tag}" entfernen`}
                disabled={disabled}
              >
                <X className="size-2.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div
        className={
          variant === "boxed"
            ? "flex items-center gap-1.5 rounded-ordilo-sm border border-border bg-card px-3 py-2"
            : "flex items-center gap-1.5"
        }
      >
        <Tag
          className="size-3.5 shrink-0 text-muted-foreground/40"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <input
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={
            variant === "boxed"
              ? "min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              : "min-w-0 flex-1 border-0 border-b border-transparent bg-transparent text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-border focus:ring-0"
          }
          data-testid={`${testId}-input`}
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={handleAddClick}
            className="shrink-0 rounded-ordilo-sm px-2 py-0.5 text-xs text-[var(--petrol)] transition-colors hover:bg-secondary"
            data-testid={`${testId}-add`}
            disabled={disabled}
            aria-label="Stichwort hinzufügen"
          >
            <Check className="size-3" aria-hidden="true" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
