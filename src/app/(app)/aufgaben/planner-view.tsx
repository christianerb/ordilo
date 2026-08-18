"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
              {openCount} offen
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

      <nav
        aria-label="Ansicht im Familienplaner"
        className="grid w-full grid-cols-2 rounded-ordilo-sm bg-secondary p-1 text-sm"
        data-testid="planner-view-switcher"
      >
        <Link
          href="/aufgaben"
          aria-current={!showPlaner ? "page" : undefined}
          className={
            !showPlaner
              ? "rounded-[8px] bg-card px-3 py-2 text-center font-medium text-foreground shadow-sm"
              : "rounded-[8px] px-3 py-2 text-center font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          }
        >
          Aufgaben
        </Link>
        <Link
          href="/aufgaben?tab=planer"
          aria-current={showPlaner ? "page" : undefined}
          className={
            showPlaner
              ? "rounded-[8px] bg-card px-3 py-2 text-center font-medium text-foreground shadow-sm"
              : "rounded-[8px] px-3 py-2 text-center font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          }
        >
          Planer
        </Link>
      </nav>
    </div>
  );
}
