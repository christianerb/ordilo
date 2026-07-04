import { cn } from "@/lib/utils";

/**
 * Default avatar color when a member has no avatar_color set.
 * Uses the Deep Petrol from the design system.
 */
const DEFAULT_AVATAR_COLOR = "#305460";

/**
 * Props for the PersonCard component.
 */
export interface PersonCardProps {
  /** The member's display name. */
  name: string;
  /** The member's role (e.g. "Vater", "Mutter", "Kind"). Omitted when null. */
  role?: string | null;
  /** Avatar fill color (hex). Falls back to Deep Petrol when null. */
  avatarColor?: string | null;
  /** Optional click handler. When provided, the card becomes interactive. */
  onClick?: () => void;
  /** Optional additional className. */
  className?: string;
}

/**
 * Person Card — a reusable component showing a family member as a card
 * with a colored avatar circle (initial letter), name, and role.
 *
 * Used in onboarding (running list of added members) and the family
 * management page.
 *
 * - Avatar circle is filled with avatarColor (fallback: Deep Petrol).
 * - Shows the first letter of the name as the avatar content.
 * - Role is shown when present, omitted when null/empty (never "null").
 * - When onClick is provided, the card is interactive (button-like).
 */
export function PersonCard({
  name,
  role,
  avatarColor,
  onClick,
  className,
}: PersonCardProps) {
  const color = avatarColor || DEFAULT_AVATAR_COLOR;
  const initial = name.charAt(0).toUpperCase() || "?";

  const content = (
    <div className="flex items-center gap-3">
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{name}</p>
        {role && role.trim() !== "" && (
          <p className="truncate text-sm text-muted-foreground">{role}</p>
        )}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full rounded-ordilo-md border border-border bg-card p-4 text-left shadow-card transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-ordilo-md border border-border bg-card p-4 shadow-card",
        className,
      )}
    >
      {content}
    </div>
  );
}
