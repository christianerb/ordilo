import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A collection's cover: a restrained folder tab that makes a family
 * collection recognizable without turning document management into a grid
 * of decorative cards.
 */
export function CollectionFolder({
  name,
  documentCount,
  Icon,
  color,
  actions,
  className,
}: {
  name: string;
  documentCount: number;
  Icon: LucideIcon;
  color: { bg: string; fg: string };
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-ordilo-md border border-border bg-card px-4 pb-4 pt-6 shadow-card sm:px-5",
        className,
      )}
      data-testid="collection-folder"
    >
      <span
        className="absolute left-4 top-0 h-3 w-28 rounded-b-ordilo-sm"
        style={{ backgroundColor: color.bg }}
        aria-hidden="true"
      />
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-ordilo-md"
          style={{ backgroundColor: color.bg }}
          aria-hidden="true"
        >
          <Icon className="size-6" style={{ color: color.fg }} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {documentCount === 0
              ? "Noch keine Dokumente"
              : documentCount === 1
                ? "1 Dokument"
                : `${documentCount} Dokumente`}
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </section>
  );
}
