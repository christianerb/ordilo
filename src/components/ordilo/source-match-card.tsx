"use client";

import { ChevronRight } from "lucide-react";
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
  /** Short matching passage that explains why the document was suggested. */
  excerpt?: string | null;
  /** Icon + label describing where this source came from. */
  kind: SourceCardKind;
  /** Highlights the strongest match without turning it into a larger card. */
  isBestMatch?: boolean;
  /**
   * 1-based citation number, when this card is also referenced inline in
   * the answer text (see `ChatMarkdown`'s "[N]" markers). Shown as a small
   * chip so the two stay visually tied together.
   */
  citationIndex?: number;
  /** DOM id — set so an inline citation marker can scroll this card into view. */
  id?: string;
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
  excerpt,
  kind,
  isBestMatch = false,
  citationIndex,
  id,
  onClick,
  className,
  style,
}: SourceMatchCardProps) {
  const clampedScore = Math.max(0, Math.min(1, score));
  const displayTitle = title?.trim() || "Unbenanntes Dokument";
  const Icon = kind.icon;
  const relevanceLabel = getRelevanceLabel(clampedScore);
  const isInteractive = !!onClick;
  const displayExcerpt = excerpt
    ?.replace(/^(Aufgabe|Person):\s*/u, "")
    .trim();

  return (
    <div
      id={id}
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
        "group flex min-h-14 w-full items-center gap-2.5 px-3 py-2.5 animate-source-card-in",
        isBestMatch && "bg-[var(--wash-sage-soft)]",
        isInteractive &&
          "cursor-pointer transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
        className,
      )}
    >
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-ordilo-sm bg-card text-[var(--petrol)]"
        aria-hidden="true"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {citationIndex !== undefined && (
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)]/10 text-[10px] font-semibold text-[var(--petrol)]"
              aria-hidden="true"
              data-testid="source-citation-index"
            >
              {citationIndex}
            </span>
          )}
          <p className="truncate text-sm font-medium text-foreground">
            {displayTitle}
          </p>
          {isBestMatch && (
            <span className="hidden shrink-0 text-[11px] font-medium text-[var(--petrol)] sm:inline">
              Beste Übereinstimmung
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {displayExcerpt && <span className="sr-only">{kind.label}</span>}
          {displayExcerpt || kind.label}
        </p>
      </div>
      <span
        className="sr-only"
        data-testid="source-match-relevance"
      >
        {relevanceLabel}
      </span>
      {isInteractive && (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-card group-hover:text-[var(--petrol)]">
          <ChevronRight className="size-4" aria-hidden="true" />
          <span className="sr-only">Dokument öffnen</span>
        </span>
      )}
    </div>
  );
}
