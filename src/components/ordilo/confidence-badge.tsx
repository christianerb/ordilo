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
  { bg: string; text: string; border: string; dot: string; label: string; tone: string }
> = {
  high: {
    bg: "bg-[var(--petrol)]/10",
    text: "text-[var(--petrol)]",
    border: "border-[var(--petrol)]/20",
    dot: "bg-[var(--petrol)]",
    label: "Hohe Zuverlässigkeit",
    tone: "sicher",
  },
  medium: {
    bg: "bg-[var(--sand-light)]",
    text: "text-[var(--mist-dark)]",
    border: "border-[var(--apricot)]/20",
    dot: "bg-[var(--apricot)]",
    label: "Mittlere Zuverlässigkeit",
    tone: "noch prüfen",
  },
  low: {
    bg: "bg-[var(--sand-light)]",
    text: "text-[var(--mist-dark)]",
    border: "border-destructive/20",
    dot: "bg-destructive",
    label: "Niedrige Zuverlässigkeit",
    tone: "unsicher",
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
  /** Optional data-testid override (defaults to "confidence-badge"). */
  "data-testid"?: string;
}

/**
 * Confidence Badge — a quiet metadata chip for uncertain extractions.
 *
 * Used in the Review Card to show the AI's confidence for each extracted
 * entity (person, organization, date, amount, task, category).
 *
 * Visual design:
 * - Soft neutral chip so the percentage reads as supporting context,
 *   not as the main headline of the row
 * - A small colored dot still carries the severity
 * - Low/medium keep their warning color, but only as an accent
 * - aria-label exposes the confidence level in plain German for screen readers
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
  "data-testid": dataTestId = "confidence-badge",
}: ConfidenceBadgeProps) {
  // Clamp confidence to [0, 1] and convert to percentage.
  const clamped = Math.max(0, Math.min(1, confidence));
  const percentage = Math.round(clamped * 100);
  const level = getConfidenceLevel(clamped);
  const styles = CONFIDENCE_STYLES[level];

  return (
    <span
      data-testid={dataTestId}
      data-confidence-level={level}
      data-confidence-value={clamped}
      aria-label={`${styles.label}: ${percentage}%`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        styles.bg,
        styles.border,
        styles.text,
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", styles.dot)}
        aria-hidden="true"
      />
      <span className="text-[var(--mist-dark)]/75">{styles.tone}</span>
      <span>{percentage}%</span>
    </span>
  );
}
