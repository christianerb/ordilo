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
      // h-dvh (not inset-0's implicit 100%) so this tracks the *visual*
      // viewport on iOS Safari: with a plain 100%-of-viewport height, the
      // keyboard doesn't shrink it — the browser instead pans the whole
      // page to keep the focused input visible, shoving the close/history
      // buttons above the top edge. dvh + interactiveWidget:resizes-content
      // (root layout viewport) together keep this actually full-height.
      className="fixed inset-x-0 top-0 z-40 flex h-dvh flex-col animate-composer-overlay lg:hidden"
    >
      {/* Backdrop — a self-contained soft-glow scene (not just a blur of
          whatever happens to be behind, which is often too plain to read
          as "blurred" at all) plus a blur of the real page for depth. */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -right-10 -top-16 h-80 w-80 rounded-full bg-[var(--wash-sage)]"
          aria-hidden="true"
        />
        <div
          className="absolute -left-24 top-1/4 size-72 rounded-full bg-[var(--apricot-light)]"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 right-[6%] h-72 w-72 rounded-full bg-[var(--wash-blue)]"
          aria-hidden="true"
        />
        {/* The blur lives on this layer, not the blobs themselves — a blur
            filter on the blob plus a backdrop-blur above it double-softens
            into near-nothing. One blur pass keeps the color visible. */}
        <div className="absolute inset-0 bg-[var(--canvas-warm)]/25 backdrop-blur-2xl" />
      </div>
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0"
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

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 text-center">
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
