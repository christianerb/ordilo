"use client";

import { cn } from "@/lib/utils";
import {
  getRelevanceLabel,
  type SourceCardKind,
} from "@/components/ordilo/source-card";

export interface SourceMatchCardProps {
  /** The UUID of the source document (used for navigation). */
  documentId: string;
  /** The document title. Falls back to "Unbenanntes Dokument" when null/empty. */
  title: string | null;
  /** Relevance score in [0, 1]. Drives the "Sehr relevant"/"Relevant" badge. */
  score: number;
  /** Icon + label describing where this source came from. */
  kind: SourceCardKind;
  /** Click handler — when provided, the card is interactive (navigates to document). */
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Source Match Card — a prominent result card for a high-relevance
 * citation, shown alongside the AI's answer instead of buried in a plain
 * "Quellen" list. Bigger icon chip, visible source-kind caption, and a
 * relevance badge ("Sehr relevant" / "Relevant") replace the raw
 * percentage so the top matches feel like part of the answer, not an
 * afterthought. Lower-relevance citations stay in the compact SourceCard
 * list ("Weitere mögliche Dokumente") so they don't compete for attention.
 *
 * @example
 * <SourceMatchCard
 *   documentId="doc-123"
 *   title="Kita-Brief"
 *   score={0.92}
 *   kind={{ icon: FileText, label: "Dokumenten-Suche" }}
 *   onClick={() => router.push(`/dokumente?doc=doc-123`)}
 * />
 */
export function SourceMatchCard({
  title,
  score,
  kind,
  onClick,
  className,
  style,
}: SourceMatchCardProps) {
  const clampedScore = Math.max(0, Math.min(1, score));
  const displayTitle = title?.trim() || "Unbenanntes Dokument";
  const Icon = kind.icon;
  const relevanceLabel = getRelevanceLabel(clampedScore);
  const isTopTier = relevanceLabel === "Sehr relevant";
  const isInteractive = !!onClick;

  return (
    <div
      data-testid="source-card"
      data-relevance={relevanceLabel}
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
      style={style}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-ordilo-sm border border-border bg-card p-3 shadow-card animate-source-card-in",
        isInteractive &&
          "cursor-pointer card-lift press-scale focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-ordilo-sm"
          style={{ backgroundColor: "var(--secondary)" }}
          aria-hidden="true"
        >
          <Icon
            className="size-4"
            style={{ color: "var(--petrol)" }}
            strokeWidth={1.75}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {kind.label}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {displayTitle}
          </p>
        </div>
      </div>
      <span
        data-testid="source-match-relevance"
        className={cn(
          "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          isTopTier
            ? "bg-[var(--petrol)] text-white"
            : "bg-[var(--petrol)]/10 text-[var(--petrol)]",
        )}
      >
        {relevanceLabel}
      </span>
    </div>
  );
}
