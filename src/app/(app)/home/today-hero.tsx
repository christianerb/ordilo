"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, ChevronRight, type LucideIcon } from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { cn } from "@/lib/utils";
import type { HomeHeroState } from "@/lib/home-briefing";

type TaskHeroState = Extract<HomeHeroState, { kind: "task" }>;

/** How long the completed hero holds before the next one arrives. */
const COMPLETION_HOLD_MS = 650;

/**
 * The "Heute" hero — the one big card on /home that answers "was brennt
 * gerade?" with a direct action. Exactly one hero renders at a time:
 *
 *   - overdue task   → apricot accents (the single apricot element on the
 *                      screen, per the Apricot Scarcity Rule)
 *   - due today      → petrol accents
 *   - due tomorrow   → quiet neutral card
 *   - urgent insight → petrol accents, links to the insight target
 *   - calm           → sage wash + mascot, no action needed
 *
 * The card never competes with the sections below it: when the hero shows
 * a task, the "Als Nächstes" list starts with the NEXT task.
 */

/** Format a YYYY-MM-DD due date as DD.MM.YYYY (German). */
function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-");
  if (!year || !month || !day) return dueDate;
  return `${day}.${month}.${year}`;
}

export function TodayHero({
  state,
  onMarkDone,
  flat = false,
}: {
  state: HomeHeroState;
  /** Marks the hero task as done — the parent recomputes the next hero. */
  onMarkDone: (taskId: string) => void;
  /** Inside the single home page frame: the hero keeps its tinted band as
      the visual peak, but drops its own border and shadow — the frame
      carries the elevation (No-Shadow-Stacking). */
  flat?: boolean;
}) {
  // Completion latch. The parent recomputes the hero the instant the task
  // flips to done — which would skip the one moment worth seeing: the
  // check landing. So we keep the completed card for a beat while the
  // save already runs (no fake delay on the data), then let the next
  // hero arrive.
  const [completing, setCompleting] = useState<TaskHeroState | null>(null);

  const handleComplete = () => {
    if (completing || state.kind !== "task") return;
    setCompleting(state);
    onMarkDone(state.task.id);
    window.setTimeout(() => setCompleting(null), COMPLETION_HOLD_MS);
  };

  if (!completing && state.kind === "calm") {
    return (
      <section
        data-testid="today-hero"
        className={cn(
          "flex items-center gap-3 rounded-ordilo-sm bg-[var(--wash-sage)] px-3 py-3.5",
          !flat && "shadow-card",
        )}
      >
        <OrdiloMascot
          mood="idle"
          size={44}
          style={{ color: "var(--petrol)" }}
          className="shrink-0"
        />
        <div>
          <p className="text-base font-semibold text-foreground">
            Alles im grünen Bereich
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Keine Fristen heute oder morgen.
          </p>
        </div>
      </section>
    );
  }

  const { task, urgency } = completing ?? (state as TaskHeroState);
  const isOverdue = urgency === "overdue";

  return (
    <section
      data-testid="today-hero"
      className={cn(
        "rounded-ordilo-sm px-3 py-3.5",
        isOverdue
          ? "bg-[var(--wash-apricot)]"
          : urgency === "today"
            ? "bg-[var(--wash-blue)]"
            : "bg-[var(--sand-light)]",
        !flat &&
          (isOverdue
            ? "border border-[var(--apricot)]/30 shadow-card"
            : urgency === "today"
              ? "border border-[var(--petrol)]/15 shadow-card"
              : "border border-border shadow-card"),
      )}
    >
      {/* One horizontal row, modeled on a journal margin note: date icon,
          task, then one compact way into the details. */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={completing !== null}
          aria-label={`${task.title} als erledigt markieren`}
          onClick={handleComplete}
          disabled={completing !== null}
          data-testid="today-hero-done"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--mist-light)] bg-[var(--surface-box)] transition-transform press-scale hover:border-[var(--petrol)] focus-ring"
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              completing
                ? "bg-[var(--petrol)]"
                : isOverdue
                  ? "text-[var(--apricot-text)]"
                  : "text-[var(--petrol)]",
            )}
            aria-hidden="true"
          >
            {completing && (
              <Check
                className="size-3.5 animate-check-pop text-[var(--warm-white)]"
                strokeWidth={3}
              />
            )}
            {!completing && (
              <CalendarClock className="size-5" strokeWidth={1.8} />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "line-clamp-2 text-sm font-semibold leading-snug text-foreground",
              completing && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <HeroLabel
              icon={completing ? Check : CalendarClock}
              text={
                completing
                  ? "Erledigt"
                  : isOverdue
                    ? "Überfällig"
                    : urgency === "today"
                      ? "Heute fällig"
                      : "Morgen fällig"
              }
              tone={isOverdue && !completing ? "apricot" : "petrol"}
            />
            {task.due_date && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {formatDueDate(task.due_date)}
                </span>
              </>
            )}
          </div>
        </div>
        <Link
          href={`/aufgaben?task=${task.id}`}
          className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-[var(--surface-box)] px-2.5 text-xs font-medium text-[var(--petrol)] transition-colors hover:bg-white focus-ring"
        >
          Details
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function HeroLabel({
  icon: Icon,
  text,
  tone,
}: {
  icon?: LucideIcon;
  text: string;
  tone: "apricot" | "petrol";
}) {
  return (
    <span
      data-testid="today-hero-label"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        tone === "apricot" ? "text-[var(--apricot-text)]" : "text-[var(--petrol)]",
      )}
    >
      {Icon ? (
        <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
      ) : null}
      {text}
    </span>
  );
}
