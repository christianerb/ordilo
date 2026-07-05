import { cn } from "@/lib/utils";

/**
 * Confidence level thresholds.
 *
 * - High:   >= 0.85 → green
 * - Medium: >= 0.70 → amber
 * - Low:    <  0.70 → red
 *
 * The low threshold (0.70) matches `LOW_CONFIDENCE_THRESHOLD` from the
 * extraction schema, so any badge showing red also triggers
 * `needs_user_review`.
 */
export const CONFIDENCE_HIGH_THRESHOLD = 0.85;
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.7;

/**
 * Confidence level type.
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Determine the confidence level from a 0–1 confidence value.
 *
 * @param confidence - A number between 0 and 1.
 * @returns "high", "medium", or "low".
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_HIGH_THRESHOLD) return "high";
  if (confidence >= CONFIDENCE_MEDIUM_THRESHOLD) return "medium";
  return "low";
}

/**
 * Visual styles for each confidence level.
 * Uses the warm design-system palette with semantic color coding.
 */
const CONFIDENCE_STYLES: Record<
  ConfidenceLevel,
  { bg: string; text: string; border: string; dot: string }
> = {
  high: {
    bg: "bg-[#E8F5E9]",
    text: "text-[#2E7D32]",
    border: "border-[#2E7D32]/20",
    dot: "bg-[#4CAF50]",
  },
  medium: {
    bg: "bg-[#FFF3E0]",
    text: "text-[#E65100]",
    border: "border-[#E65100]/20",
    dot: "bg-[#FF9800]",
  },
  low: {
    bg: "bg-[#FFEBEE]",
    text: "text-[#C62828]",
    border: "border-[#C62828]/20",
    dot: "bg-[#EF5350]",
  },
};

/**
 * Props for the ConfidenceBadge component.
 */
export interface ConfidenceBadgeProps {
  /** Confidence value between 0 and 1. */
  confidence: number;
  /** Optional additional className. */
  className?: string;
}

/**
 * Confidence Badge — a small pill showing the confidence percentage,
 * color-coded by level (green high, amber medium, red low).
 *
 * Used in the Review Card to show the AI's confidence for each extracted
 * entity (person, organization, date, amount, task, category).
 *
 * Visual design:
 * - Small rounded pill with a colored dot and percentage text
 * - Green for high confidence (>= 85%)
 * - Amber for medium confidence (>= 70%)
 * - Red for low confidence (< 70%)
 *
 * @example
 * <ConfidenceBadge confidence={0.92} />
 * // Renders: "● 92%" in green
 *
 * <ConfidenceBadge confidence={0.65} />
 * // Renders: "● 65%" in red
 */
export function ConfidenceBadge({
  confidence,
  className,
}: ConfidenceBadgeProps) {
  // Clamp confidence to [0, 1] and convert to percentage.
  const clamped = Math.max(0, Math.min(1, confidence));
  const percentage = Math.round(clamped * 100);
  const level = getConfidenceLevel(clamped);
  const styles = CONFIDENCE_STYLES[level];

  return (
    <span
      data-testid="confidence-badge"
      data-confidence-level={level}
      data-confidence-value={clamped}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        styles.bg,
        styles.text,
        styles.border,
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", styles.dot)}
        aria-hidden="true"
      />
      {percentage}%
    </span>
  );
}
