"use client";

import { FileText, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for the SourceCard component.
 */
export interface SourceCardProps {
  /** The UUID of the source document (used for navigation). */
  documentId: string;
  /** The document title. Falls back to "Unbenanntes Dokument" when null/empty. */
  title: string | null;
  /** A text snippet from the document (the matching chunk or entity description). */
  excerpt: string;
  /** Relevance score in [0, 1]. Clamped and displayed as a percentage. */
  score: number;
  /** Click handler — when provided, the card is interactive (navigates to document). */
  onClick?: () => void;
  /** Optional additional className. */
  className?: string;
}

/**
 * Source Card — displays a single search/chat result as a clickable card
 * with a document icon, title, excerpt, and a bounded relevance score.
 *
 * Used in the Search/Chat UI under AI answers (VAL-SEARCH-026, VAL-CHAT-023)
 * and in search results. Clicking the card navigates to the document detail
 * view (VAL-SEARCH-027).
 *
 * Relevance scores are clamped to [0, 1] and displayed as a percentage
 * (VAL-CHAT-033). Special characters in title/excerpt are rendered as text
 * content (safe by default in React — VAL-CHAT-034).
 *
 * @example
 * <SourceCard
 *   documentId="doc-123"
 *   title="Stromrechnung Juli"
 *   excerpt="Rechnung über 45,80 €"
 *   score={0.85}
 *   onClick={() => router.push(`/scan?doc=doc-123`)}
 * />
 */
export function SourceCard({
  title,
  excerpt,
  score,
  onClick,
  className,
}: SourceCardProps) {
  // Clamp score to [0, 1] and convert to percentage (VAL-CHAT-033).
  const clampedScore = Math.max(0, Math.min(1, score));
  const percentage = Math.round(clampedScore * 100);

  // Fall back to "Unbenanntes Dokument" when title is null or empty.
  const displayTitle = title?.trim() || "Unbenanntes Dokument";

  // Determine the document icon (always FileText for source cards —
  // the document type is not available in the search result).
  const Icon: LucideIcon = FileText;

  const isInteractive = !!onClick;

  return (
    <div
      data-testid="source-card"
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "flex gap-3 rounded-ordilo-md border border-border bg-card p-4 shadow-card",
        isInteractive &&
          "cursor-pointer transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      {/* Document icon */}
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-ordilo-sm"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        <Icon
          className="size-5"
          style={{ color: "var(--petrol)" }}
          strokeWidth={1.5}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Title */}
        <p className="truncate text-sm font-semibold text-foreground">
          {displayTitle}
        </p>

        {/* Excerpt */}
        {excerpt && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {excerpt}
          </p>
        )}

        {/* Relevance score */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[11px] text-muted-foreground">Relevanz</span>
          <span
            className="text-[11px] font-medium text-[var(--petrol)]"
            data-testid="source-card-score"
            data-score={clampedScore}
          >
            {percentage}%
          </span>
        </div>
      </div>
    </div>
  );
}
