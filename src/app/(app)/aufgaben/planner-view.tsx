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
  const { openCreate } = usePlannerActions();

  return (
    <div className="app-page-heading">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Familienplaner
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Alles, was ihr gemeinsam im Blick behalten möchtet.
        </p>
      </div>
      {familyId && (
        <Button
          size="sm"
          className="gap-1.5"
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
