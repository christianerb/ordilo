"use client";

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
 * or "Planer" (?tab=planer). The URL is the source of truth; switching
 * happens exclusively through the nav sub-items (Familienplaner →
 * Aufgaben / Planer), there is no in-page tab switcher.
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
  );
}
