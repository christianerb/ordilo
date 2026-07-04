import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGermanDate } from "@/lib/format";

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
  /** The member's birthdate as an ISO string (YYYY-MM-DD). Displayed in German format. Omitted when null. */
  birthdate?: string | null;
  /** Avatar fill color (hex). Falls back to Deep Petrol when null. */
  avatarColor?: string | null;
  /** Optional click handler. When provided, the main content area is a button (e.g. for navigation to a profile). */
  onClick?: () => void;
  /** Optional edit handler. When provided, an edit (pencil) button is shown. */
  onEdit?: () => void;
  /** Optional remove handler. When provided, a remove (trash) button is shown. */
  onRemove?: () => void;
  /** Optional additional className. */
  className?: string;
}

/**
 * Person Card — a reusable component showing a family member as a card
 * with a colored avatar circle (initial letter), name, role, and optional
 * birthdate.
 *
 * Used in onboarding (running list of added members) and the family
 * management page.
 *
 * - Avatar circle is filled with avatarColor (fallback: Deep Petrol).
 * - Shows the first letter of the name as the avatar content.
 * - Role is shown when present, omitted when null/empty (never "null").
 * - Birthdate is shown in German format (DD.MM.YYYY) when present, omitted when null.
 * - When onClick is provided, the content area is a button (for navigation).
 * - When onEdit/onRemove are provided, action buttons appear on the right.
 *   These are separate buttons so clicking them does not trigger onClick.
 */
export function PersonCard({
  name,
  role,
  birthdate,
  avatarColor,
  onClick,
  onEdit,
  onRemove,
  className,
}: PersonCardProps) {
  const color = avatarColor || DEFAULT_AVATAR_COLOR;
  const initial = name.charAt(0).toUpperCase() || "?";
  const formattedBirthdate = formatGermanDate(birthdate);
  const hasActions = Boolean(onEdit || onRemove);

  // The inner content — avatar + text (name, role, birthdate).
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
        {formattedBirthdate && (
          <p className="truncate text-sm text-muted-foreground">
            {formattedBirthdate}
          </p>
        )}
      </div>
    </div>
  );

  // Determine the wrapper for the content area:
  // - onClick provided → button (interactive, for navigation)
  // - no onClick → div (display-only)
  const contentWrapper = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-md"
      aria-label={`${name} öffnen`}
    >
      {content}
    </button>
  ) : (
    <div className="flex flex-1 items-center">{content}</div>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-ordilo-md border border-border bg-card p-4 shadow-card",
        onClick && "transition-all hover:shadow-card-hover",
        className,
      )}
    >
      {contentWrapper}

      {/* Action buttons (edit / remove) */}
      {hasActions && (
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex size-9 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Bearbeiten"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex size-9 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Entfernen"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
