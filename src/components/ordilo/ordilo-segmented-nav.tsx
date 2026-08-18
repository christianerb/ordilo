import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A URL-driven local view switcher, for closely related sibling views. */
export function OrdiloSegmentedNav({
  label,
  items,
  className,
  testId,
  variant = "segmented",
}: {
  label: string;
  items: Array<{
    href: string;
    label: string;
    active: boolean;
    /** Optional icon in front of the label. */
    icon?: LucideIcon;
    /**
     * How many things this view holds. Shown as a pill so switching tabs
     * is a decision, not a guess.
     */
    count?: number;
  }>;
  className?: string;
  testId?: string;
  variant?: "segmented" | "morphing";
}) {
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.active),
  );

  return (
    <nav
      aria-label={label}
      data-testid={testId}
      className={cn(
        "relative isolate grid w-full grid-flow-col auto-cols-fr bg-secondary p-1 text-sm",
        variant === "morphing"
          ? "min-h-13 rounded-t-ordilo-sm pb-0"
          : "rounded-ordilo-sm",
        className,
      )}
    >
      {variant === "morphing" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-2 left-1 top-1 -z-0 rounded-t-[11px] bg-[var(--surface-box)] shadow-[0_-1px_0_var(--border),1px_0_0_var(--border),-1px_0_0_var(--border)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
          style={{
            width: `calc((100% - 8px) / ${items.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
      )}
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "relative z-10 px-2 py-2 text-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-3",
              variant === "morphing"
                ? "flex min-h-11 items-center justify-center gap-1.5 rounded-[9px]"
                : "rounded-[8px]",
              item.active
                ? variant === "morphing"
                  ? "text-foreground"
                  : "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  item.active ? "text-[var(--petrol)]" : "text-current",
                )}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span
                className={cn(
                  "hidden rounded-full px-1.5 py-px text-xs font-medium tabular-nums sm:inline",
                  item.active
                    ? "bg-[var(--petrol)]/10 text-[var(--petrol)]"
                    : "bg-[color-mix(in_srgb,var(--mist-light)_55%,transparent)] text-[var(--mist-dark)]",
                )}
              >
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
