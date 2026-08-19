"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarDays, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ordilo/animated-number";
import { OrdiloFilterTabs } from "@/components/ordilo/ordilo-filter-tabs";
import {
  PlannerActionsProvider,
  usePlannerActions,
} from "./planner-actions-context";

type PlannerViewId = "aufgaben" | "planer";

function getPlannerView(tab: string | null): PlannerViewId {
  return tab === "planer" ? "planer" : "aufgaben";
}

function getPlannerHref(view: PlannerViewId): string {
  return view === "planer" ? "/aufgaben?tab=planer" : "/aufgaben";
}

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
  const router = useRouter();
  const routeView = getPlannerView(useSearchParams().get("tab"));
  const [view, setView] = useState<PlannerViewId>(routeView);
  const [renderedRouteView, setRenderedRouteView] = useState(routeView);
  // Switch the visible client view before the URL navigation reaches the
  // server. Later deep links and browser back/forward still reconcile to
  // the URL, just like the immediate switcher in Meine Ablage.
  if (routeView !== renderedRouteView) {
    setRenderedRouteView(routeView);
    setView(routeView);
  }
  const showPlaner = view === "planer";

  return (
    <PlannerActionsProvider>
      <PlannerHeader
        view={view}
        familyId={familyId}
        onViewChange={(nextView) => {
          if (nextView === view) return;
          setView(nextView);
          router.push(getPlannerHref(nextView));
        }}
      />
      {showPlaner ? calendar : tasks}
    </PlannerActionsProvider>
  );
}

function PlannerHeader({
  view,
  familyId,
  onViewChange,
}: {
  view: PlannerViewId;
  familyId: string | null;
  onViewChange: (view: PlannerViewId) => void;
}) {
  const { openCreate, openCount } = usePlannerActions();
  const showPlaner = view === "planer";

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

      <OrdiloFilterTabs
        value={view}
        onChange={onViewChange}
        ariaLabel="Ansicht im Familienplaner"
        tabs={[
          { key: "aufgaben", label: "Aufgaben", icon: ListChecks },
          { key: "planer", label: "Planer", icon: CalendarDays },
        ]}
        testId="planner-view-switcher"
        className="w-full max-w-[17rem] flex-none"
      />
    </div>
  );
}
