"use client";

import { FileText, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon + label describing where a source citation came from (e.g. document search vs. task search). */
export interface SourceCardKind {
  icon: LucideIcon;
  label: string;
}

/**
 * Props for the SourceCard component.
 */
export interface SourceCardProps {
  /** The UUID of the source document (used for navigation). */
  documentId: string;
  /** The document title. Falls back to "Unbenanntes Dokument" when null/empty. */
  title: string | null;
  /** Relevance score in [0, 1]. Clamped and displayed as a percentage. */
  score: number;
  /** Click handler — when provided, the card is interactive (navigates to document). */
  onClick?: () => void;
  /** Optional additional className. */
  className?: string;
  /**
   * The kind of search that surfaced this source (icon + German label),
   * e.g. "Aufgaben-Suche" for a task-derived source. Defaults to a generic
   * document-search label when not provided.
   */
  kind?: SourceCardKind;
}

const DEFAULT_SOURCE_KIND: SourceCardKind = {
  icon: FileText,
  label: "Dokumenten-Suche",
};

/**
 * A friendly, German relevance band for a [0, 1] score — used instead of a
 * raw percentage wherever a citation is promoted to a prominent spot (e.g.
 * SourceMatchCard), since a rounded label reads calmer than "51 %".
 */
export function getRelevanceLabel(
  score: number,
): "Sehr relevant" | "Relevant" | "Möglich relevant" {
  if (score >= 0.75) return "Sehr relevant";
  if (score >= 0.5) return "Relevant";
  return "Möglich relevant";
}

/**
 * Source Card — an ultra-compact citation row for a single search/chat
 * source (kind icon, document title, relevance score). Sits below the AI
 * answer under "Weitere mögliche Dokumente"/"Quellen", styled as a plain,
 * low-weight list row (no card border/background) so a long citation list
 * stays out of the way instead of competing with the answer above it. The
 * source kind (e.g. "Aufgaben-Suche") is exposed to assistive tech only —
 * the icon carries it visually — to keep the row to a single text line.
 *
 * Used in the Search/Chat UI under AI answers (VAL-SEARCH-026, VAL-CHAT-023).
 * Clicking the row navigates to the document detail view (VAL-SEARCH-027).
 *
 * Relevance scores are clamped to [0, 1] and displayed as a percentage
 * (VAL-CHAT-033). Special characters in the title are rendered as text
 * content (safe by default in React — VAL-CHAT-034).
 *
 * @example
 * <SourceCard
 *   documentId="doc-123"
 *   title="Stromrechnung Juli"
 *   score={0.85}
 *   kind={{ icon: ListChecks, label: "Aufgaben-Suche" }}
 *   onClick={() => router.push(`/dokumente?doc=doc-123`)}
 * />
 */
export function SourceCard({
  title,
  score,
  onClick,
  className,
  kind = DEFAULT_SOURCE_KIND,
  style,
}: SourceCardProps & { style?: React.CSSProperties }) {
  // Clamp score to [0, 1] and convert to percentage (VAL-CHAT-033).
  const clampedScore = Math.max(0, Math.min(1, score));
  const percentage = Math.round(clampedScore * 100);

  // Fall back to "Unbenanntes Dokument" when title is null or empty.
  const displayTitle = title?.trim() || "Unbenanntes Dokument";

  const Icon = kind.icon;
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
      style={style}
      className={cn(
        "flex w-full items-center gap-2 rounded-ordilo-sm px-2 py-1.5 transition-colors animate-source-card-in",
        isInteractive &&
          "cursor-pointer hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <Icon
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
        strokeWidth={1.75}
      />
      <span className="sr-only">{kind.label}</span>
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">
        {displayTitle}
      </p>
      <span
        className="shrink-0 text-xs tabular-nums text-muted-foreground/70"
        data-testid="source-card-score"
        data-score={clampedScore}
        aria-label={`Relevanz ${percentage} Prozent`}
      >
        {percentage}%
      </span>
    </div>
  );
}
