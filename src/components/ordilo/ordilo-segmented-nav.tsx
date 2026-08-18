import Link from "next/link";
import { cn } from "@/lib/utils";

/** A URL-driven local view switcher, for closely related sibling views. */
export function OrdiloSegmentedNav({
  label,
  items,
  className,
  testId,
}: {
  label: string;
  items: Array<{ href: string; label: string; active: boolean }>;
  className?: string;
  testId?: string;
}) {
  return (
    <nav
      aria-label={label}
      data-testid={testId}
      className={cn(
        "grid w-full grid-flow-col auto-cols-fr rounded-ordilo-sm bg-secondary p-1 text-sm",
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "rounded-[8px] px-3 py-2 text-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            item.active
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
