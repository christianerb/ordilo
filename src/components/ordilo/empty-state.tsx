import type { LucideIcon } from "lucide-react";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrdiloMascot, type OrdiloMascotMood } from "@/components/ordilo/mascot";

/**
 * Props for the EmptyState component.
 */
export interface EmptyStateProps {
  /** German heading — the main message. */
  title: string;
  /** German description — supporting text shown below the title. */
  description?: string;
  /** Icon shown in the warm illustration circle. Defaults to UserPlus. */
  icon?: LucideIcon;
  /**
   * When set, shows the Ordilo mascot (instead of `icon`) in the
   * illustration circle, expressing this mood. Use for warm, higher-touch
   * moments (welcome, first-run, celebratory "all done" states).
   */
  mascotMood?: OrdiloMascotMood;
  /** Label for the optional call-to-action button (German). */
  actionLabel?: string;
  /** Click handler for the CTA button. Must be paired with actionLabel. */
  onAction?: () => void;
  /** Optional additional className for the container. */
  className?: string;
}

/**
 * Empty State — a warm, inviting placeholder shown when a list or section
 * has no content.
 *
 * Features:
 * - Warm illustration area (sand-colored circle with an icon)
 * - German heading and optional description
 * - Optional call-to-action button
 *
 * Used in the family management page (no members), document list (no
 * documents), search (no results), and other empty-list scenarios.
 *
 * @example
 * <EmptyState
 *   title="Noch keine Familienmitglieder"
 *   description="Füge eine Person hinzu, um zu beginnen."
 *   actionLabel="Person hinzufügen"
 *   onAction={() => openAddDialog()}
 * />
 */
export function EmptyState({
  title,
  description,
  icon: Icon = UserPlus,
  mascotMood,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {/* Warm illustration area */}
      <div
        data-testid="empty-state-illustration"
        className="mb-5 flex size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--secondary)" }}
        aria-hidden="true"
      >
        {mascotMood ? (
          <OrdiloMascot
            size={44}
            mood={mascotMood}
            style={{ color: "var(--petrol)" }}
          />
        ) : (
          <Icon
            className="size-9"
            style={{ color: "var(--mist)" }}
            strokeWidth={1.5}
          />
        )}
      </div>

      {/* Heading */}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      {/* Description */}
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {/* CTA button */}
      {actionLabel && onAction && (
        <Button
          type="button"
          size="lg"
          onClick={onAction}
          className="mt-6 h-12 rounded-ordilo-md px-6"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
