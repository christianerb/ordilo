"use client";

import Link from "next/link";
import { X, History } from "lucide-react";
import { AISearchBar } from "@/components/ordilo/ai-search-bar";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { getGreeting } from "@/components/ordilo/app-shell-shared";

/**
 * The fullscreen "zoomed in" composer state (Granola-style): focusing the
 * collapsed pill opens this instead of typing inline, so there is room for
 * a greeting, recent-question suggestions, and the two-row input without
 * fighting the collapsed bar for space. The page behind stays visible but
 * blurred — this is a focus mode, not a new screen.
 */
export function ComposerOverlay({
  value,
  onValueChange,
  onSubmit,
  isLoading = false,
  onClose,
  recentQueries = [],
  greetingName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  onClose: () => void;
  /** Recent chat titles, newest first — shown as tappable suggestion chips. */
  recentQueries?: string[];
  /** Family/display name for the greeting headline, when known. */
  greetingName?: string;
}) {
  // Locks background scroll while the overlay covers the screen, and
  // restores it on close — the fixed layer has no scroll container of its
  // own for the page behind it.
  useMountEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  useMountEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const submitQuery = (query: string) => {
    onSubmit(query);
    onClose();
  };

  return (
    <div
      data-testid="composer-overlay"
      className="fixed inset-0 z-40 flex flex-col lg:hidden"
    >
      {/* Backdrop — the page behind stays visible but blurred, so the
          overlay reads as "focus", not "navigate away". */}
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--canvas-warm)]/70 backdrop-blur-xl"
      />

      <div className="relative flex h-full flex-col">
        <div
          className="flex items-center justify-between px-4"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            data-testid="composer-overlay-close"
            className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-box)] text-foreground shadow-card transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <Link
            href="/suche?history=1"
            onClick={onClose}
            aria-label="Chat-Verlauf"
            className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-box)] text-foreground shadow-card transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <History className="size-5" aria-hidden="true" />
          </Link>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="font-serif text-3xl text-foreground">
            {getGreeting(new Date())}
            {greetingName ? <>, {greetingName}</> : null}
          </p>
          <p className="mt-1 text-xl text-muted-foreground">Frage Ordilo …</p>
        </div>

        <div className="px-4 pb-2">
          {recentQueries.length > 0 && (
            <div
              className="mb-3 flex gap-2 overflow-x-auto pb-1"
              data-testid="composer-overlay-suggestions"
            >
              {recentQueries.map((query) => (
                <button
                  key={query}
                  type="button"
                  onClick={() => submitQuery(query)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-border bg-[var(--surface-box)] px-4 py-2 text-sm text-foreground shadow-card transition-colors hover:bg-accent"
                >
                  {query}
                </button>
              ))}
            </div>
          )}

          <div
            className="mx-auto w-full max-w-md"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <AISearchBar
              value={value}
              onValueChange={onValueChange}
              onSubmit={submitQuery}
              layout="stacked"
              autoFocus
              isLoading={isLoading}
              placeholder="Frage Ordilo …"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
