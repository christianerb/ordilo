"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A quiet, progressively disclosed group of secondary information.
 *
 * The shell stays in the document flow instead of opening another overlay.
 * Its grid transition is intentionally restrained and reduced-motion safe
 * through the global motion override.
 */
export function OrdiloDisclosure({
  title,
  description,
  defaultOpen = false,
  children,
  className,
  testId,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={cn("border-t border-border/70", className)} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-12 w-full items-center gap-3 py-3 text-left focus-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          {description && (
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={contentId}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr] pb-3" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
