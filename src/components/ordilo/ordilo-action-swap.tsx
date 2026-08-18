import type { LucideIcon } from "lucide-react";

/**
 * Changes a small action label after a confirmed result. This gives one
 * specific acknowledgement without a persistent success banner.
 */
export function OrdiloActionSwap({
  active,
  idleLabel,
  activeLabel,
  IdleIcon,
  ActiveIcon,
}: {
  active: boolean;
  idleLabel: string;
  activeLabel: string;
  IdleIcon: LucideIcon;
  ActiveIcon: LucideIcon;
}) {
  const Icon = active ? ActiveIcon : IdleIcon;
  const label = active ? activeLabel : idleLabel;

  return (
    <span
      key={label}
      className="inline-flex items-center gap-1.5 animate-status-settle"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </span>
  );
}
