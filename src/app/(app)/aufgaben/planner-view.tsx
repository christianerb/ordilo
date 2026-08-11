"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PlannerActionsProvider,
  usePlannerActions,
} from "./planner-actions-context";

/**
 * The Familienplaner page shell: page heading with a local view switcher
 * ("Aufgaben" default / "Planer" for ?tab=planer) and the primary create
 * action on the right. The URL stays the source of truth — the switcher
 * links to the sibling route so the active mode is always visible and
 * reachable in place, not only through the nav sub-items.
 *
 * The header button opens the create sheet of whichever view is active;
 * the view clients register their handler through PlannerActionsContext
 * because the sheets (and their state) live inside them.
 */
export function PlannerView({
  tasks,
  calendar,
  familyId,
}: {
  tasks: ReactNode;
  calendar: ReactNode;
  familyId: string | null;
}) {
  const showPlaner = useSearchParams().get("tab") === "planer";

  return (
    <PlannerActionsProvider>
      <PlannerHeader showPlaner={showPlaner} familyId={familyId} />
      <Fragment key={showPlaner ? "calendar" : "tasks"}>
        {showPlaner ? calendar : tasks}
      </Fragment>
    </PlannerActionsProvider>
  );
}

function PlannerHeader({
  showPlaner,
  familyId,
}: {
  showPlaner: boolean;
  familyId: string | null;
}) {
  const { openCreate } = usePlannerActions();

  return (
    <div className="app-page-heading">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Familienplaner
        </h1>
        <div
          className="mt-2 inline-grid grid-cols-2 rounded-ordilo-sm bg-secondary p-1 text-xs"
          role="group"
          aria-label="Ansicht wählen"
          data-testid="planner-view-switcher"
        >
          {(
            [
              { href: "/aufgaben", label: "Aufgaben", active: !showPlaner },
              { href: "/aufgaben?tab=planer", label: "Planer", active: showPlaner },
            ] as const
          ).map(({ href, label, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-[8px] px-3 py-1.5 font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-7",
                active && "bg-card text-foreground shadow-sm",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      {familyId && (
        <Button
          size="sm"
          className="h-11 gap-1.5 sm:h-8"
          onClick={openCreate}
          data-testid="planner-create-button"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {showPlaner ? "Termin" : "Neue Aufgabe"}
        </Button>
      )}
    </div>
  );
}
