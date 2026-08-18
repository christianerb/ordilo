"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ordilo/animated-number";
import { OrdiloSegmentedNav } from "@/components/ordilo/ordilo-segmented-nav";
import {
  PlannerActionsProvider,
  usePlannerActions,
} from "./planner-actions-context";

/**
 * The Familienplaner page shell: page heading with the primary create
 * action on the right, plus one of the two views — "Aufgaben" (default)
 * or "Planer" (?tab=planer). The URL is the source of truth and the
 * local switcher makes the two closely related views visible on the page,
 * alongside their deep links in navigation.
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
      {showPlaner ? calendar : tasks}
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
  const { openCreate, openCount } = usePlannerActions();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--petrol)]">
            Familienplaner
          </h1>
          {!showPlaner && openCount !== null && (
            <span
              className="shrink-0 text-sm text-muted-foreground tabular-nums"
              data-testid="planner-open-count"
            >
              <AnimatedNumber value={openCount} /> offen
            </span>
          )}
        </div>
        {familyId && (
          <Button
            size="icon"
            onClick={openCreate}
            aria-label={showPlaner ? "Neuer Termin" : "Neue Aufgabe"}
            title={showPlaner ? "Neuer Termin" : "Neue Aufgabe"}
            className="size-11 shrink-0 rounded-full"
            data-testid="planner-create-button"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Button>
        )}
      </div>

      <OrdiloSegmentedNav
        label="Ansicht im Familienplaner"
        items={[
          { href: "/aufgaben", label: "Aufgaben", active: !showPlaner },
          {
            href: "/aufgaben?tab=planer",
            label: "Planer",
            active: showPlaner,
          },
        ]}
        testId="planner-view-switcher"
      />
    </div>
  );
}
