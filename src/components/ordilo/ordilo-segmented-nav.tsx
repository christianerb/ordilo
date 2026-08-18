import Link from "next/link";
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
  items: Array<{ href: string; label: string; active: boolean }>;
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
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative z-10 px-3 py-2 text-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            variant === "morphing"
              ? "flex min-h-11 items-center justify-center rounded-[9px]"
              : "rounded-[8px]",
            item.active
              ? variant === "morphing"
                ? "text-foreground"
                : "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
