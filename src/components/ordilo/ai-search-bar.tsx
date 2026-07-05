"use client";

import { useState, useCallback, useRef, type KeyboardEvent } from "react";
import { Sparkles, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for the AISearchBar component.
 */
export interface AISearchBarProps {
  /** Called with the trimmed query when the user submits (Enter or button). */
  onSubmit: (query: string) => void;
  /** Initial value for the input (e.g. pre-filled from home page). */
  initialValue?: string;
  /**
   * Optional controlled value. When provided, the input is controlled by
   * the parent (the parent owns the value and is notified via
   * `onValueChange`). Used on the /suche page so example/suggested queries
   * can populate the bar without submitting (VAL-SEARCH-032 non-blocking).
   */
  value?: string;
  /**
   * Called when the input value changes. Required for controlled mode
   * (when `value` is provided). The parent should update its `value` prop.
   */
  onValueChange?: (value: string) => void;
  /** Placeholder text (German). Defaults to "Frage Ordilo oder suche nach Dokumenten…". */
  placeholder?: string;
  /** When true, the input and send button are disabled and no submit fires. */
  isLoading?: boolean;
  /** Optional additional className for the outer container. */
  className?: string;
}

/**
 * AI Search Bar — a pill-shaped input with an AI sparkle icon and a send
 * button.
 *
 * The primary entry point for both search and chat on the /suche page
 * (VAL-CHAT-028). Submitting a natural-language query triggers the chat
 * flow (combined search + LLM synthesis).
 *
 * Submit behaviour:
 *   - Enter (without Shift) → submit
 *   - Shift+Enter → newline (no submit)
 *   - Send button click → submit
 *   - Empty / whitespace-only input → no submit
 *
 * The input is cleared after a successful submit.
 *
 * @example
 * <AISearchBar
 *   onSubmit={(q) => handleSearch(q)}
 *   isLoading={isSearching}
 *   placeholder="Frage Ordilo…"
 * />
 */
export function AISearchBar({
  onSubmit,
  initialValue = "",
  value,
  onValueChange,
  placeholder = "Frage Ordilo oder suche nach Dokumenten…",
  isLoading = false,
  className,
}: AISearchBarProps) {
  // Controlled mode is active when the parent provides a `value` prop.
  // In controlled mode the parent owns the value; in uncontrolled mode the
  // component manages its own internal state (backward-compatible).
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(initialValue);
  const currentValue = isControlled ? (value as string) : internalValue;

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Notify the parent of a value change (controlled mode) or update the
  // internal state (uncontrolled mode).
  const setValue = useCallback(
    (next: string) => {
      if (isControlled) {
        onValueChange?.(next);
      } else {
        setInternalValue(next);
      }
    },
    [isControlled, onValueChange],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = currentValue.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
    // Clear the bar after a successful submit. In controlled mode this
    // notifies the parent to reset its value.
    setValue("");
    // Reset textarea height after clearing.
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [currentValue, isLoading, onSubmit, setValue]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Auto-resize the textarea up to a max height.
  const handleInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div
      data-testid="ai-search-bar"
      className={cn(
        "flex items-end gap-2 rounded-ordilo-pill border bg-card px-3 py-2 shadow-card transition-shadow focus-within:shadow-card-hover",
        isLoading ? "border-transparent opacity-70" : "border-border",
        className,
      )}
    >
      {/* AI sparkle icon */}
      <Sparkles
        className="mb-1.5 size-5 shrink-0"
        style={{ color: "var(--petrol)" }}
        aria-hidden="true"
      />

      {/* Textarea input (grows with content) */}
      <textarea
        ref={inputRef}
        value={currentValue}
        onChange={(e) => {
          setValue(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder={placeholder}
        rows={1}
        aria-label="Such- und Chat-Eingabe"
        className="max-h-[120px] flex-1 resize-none border-0 bg-transparent py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
      />

      {/* Send button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isLoading || !currentValue.trim()}
        aria-label="Senden"
        className={cn(
          "mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isLoading || !currentValue.trim()
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-[var(--petrol)] text-white hover:bg-[var(--petrol-dark)]",
        )}
      >
        <ArrowUp className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
