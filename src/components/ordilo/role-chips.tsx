"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The shared role options, offered as one-tap chips wherever a family
 * member's role is entered (onboarding quick-add and the family
 * management form). One list so the naming stays consistent everywhere.
 */
export const ROLE_CHIPS = [
  "Partner:in",
  "Kind",
  "Mutter",
  "Vater",
  "Oma",
  "Opa",
  "Bruder",
  "Schwester",
] as const;

/**
 * Props for the RoleChipGroup component.
 */
export interface RoleChipGroupProps {
  /** The currently selected role ("" for none). */
  value: string;
  /** Called with the new role, or "" when the selected chip is tapped again. */
  onChange: (role: string) => void;
  /** Whether the chips are disabled (e.g. while submitting). */
  disabled?: boolean;
  /** Accessible label for the chip group. */
  "aria-label"?: string;
}

/**
 * Role Chip Group — one-tap role selection for a family member.
 *
 * Tapping a chip selects it; tapping the selected chip again clears the
 * selection. A pre-existing role that isn't in the standard list (e.g.
 * entered as free text before chips existed) is shown as an extra chip so
 * editing never silently drops it.
 */
export function RoleChipGroup({
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel = "Rolle wählen",
}: RoleChipGroupProps) {
  // Captured once on mount so the custom chip stays tappable after the
  // user deselects it.
  const [customRole] = useState(() =>
    value && !(ROLE_CHIPS as readonly string[]).includes(value) ? value : null,
  );
  const chips = customRole ? [...ROLE_CHIPS, customRole] : [...ROLE_CHIPS];

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {chips.map((role) => (
        <button
          key={role}
          type="button"
          onClick={() => onChange(value === role ? "" : role)}
          disabled={disabled}
          aria-pressed={value === role}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            value === role
              ? "bg-[var(--petrol)] text-white"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
        >
          {role}
        </button>
      ))}
    </div>
  );
}
