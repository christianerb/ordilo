"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OrdiloAccordionProps {
  title: string;
  children: ReactNode;
  description?: string;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  testId?: string;
}

/**
 * A quiet disclosure for secondary information. The short, slightly eased
 * resize gives the content a soft landing without competing with the card.
 */
export function OrdiloAccordion({
  title,
  children,
  description,
  defaultOpen = false,
  className,
  contentClassName,
  testId,
}: OrdiloAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section
      className={cn(
        "rounded-ordilo-sm border border-border bg-[var(--sand-light)]/55",
        className,
      )}
      data-testid={testId}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center gap-3 rounded-ordilo-sm px-3 text-left transition-colors hover:bg-[var(--sand-warm)]/65 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          {description && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(.22,1.35,.36,1)] motion-reduce:transition-none motion-reduce:duration-0",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={contentId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.22,1.18,.36,1)] motion-reduce:transition-none motion-reduce:duration-0",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={cn("border-t border-border px-3 py-3", contentClassName)}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
