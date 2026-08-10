"use client";

import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Check,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { cn } from "@/lib/utils";
import type { HomeHeroState } from "@/lib/home-briefing";
import type { HomeInsight } from "@/lib/ai/insights";

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

const INSIGHT_ICONS: Record<HomeInsight["icon"], LucideIcon> = {
  alert: AlertCircle,
  receipt: Receipt,
  building: Building2,
  calendar: CalendarClock,
};

/** Format a YYYY-MM-DD due date as DD.MM.YYYY (German). */
function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split("-");
  if (!year || !month || !day) return dueDate;
  return `${day}.${month}.${year}`;
}

export function TodayHero({
  state,
  onMarkDone,
}: {
  state: HomeHeroState;
  /** Marks the hero task as done — the parent recomputes the next hero. */
  onMarkDone: (taskId: string) => void;
}) {
  if (state.kind === "calm") {
    return (
      <section
        data-testid="today-hero"
        className="flex items-center gap-4 rounded-ordilo-md bg-[var(--wash-sage)] p-4 shadow-card"
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

  if (state.kind === "insight") {
    const { insight } = state;
    const Icon = INSIGHT_ICONS[insight.icon] ?? AlertCircle;
    return (
      <section
        data-testid="today-hero"
        className="rounded-ordilo-md border border-[var(--petrol)]/15 bg-[var(--petrol)]/[0.06] p-4 shadow-card"
      >
        <HeroLabel icon={Icon} text="Hinweis" tone="petrol" />
        <p className="mt-2 text-base font-semibold text-foreground">
          {insight.title}
        </p>
        {insight.detail && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {insight.detail}
          </p>
        )}
        <div className="mt-3">
          <Link
            href={insight.href}
            className="inline-flex h-11 items-center rounded-ordilo-sm bg-[var(--petrol)] px-4 text-sm font-medium text-[var(--warm-white)] transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Ansehen
          </Link>
        </div>
      </section>
    );
  }

  const { task, urgency } = state;
  const isOverdue = urgency === "overdue";

  return (
    <section
      data-testid="today-hero"
      className={cn(
        "rounded-ordilo-md border p-4 shadow-card",
        isOverdue
          ? "border-[var(--apricot)]/30 bg-[var(--apricot)]/[0.06]"
          : urgency === "today"
            ? "border-[var(--petrol)]/15 bg-[var(--petrol)]/[0.06]"
            : "border-border bg-card",
      )}
    >
      <HeroLabel
        icon={CalendarClock}
        text={
          isOverdue
            ? "Überfällig"
            : urgency === "today"
              ? "Heute fällig"
              : "Morgen fällig"
        }
        tone={isOverdue ? "apricot" : "petrol"}
      />
      <p className="mt-2 text-base font-semibold text-foreground">
        {task.title}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {task.due_date ? `Fällig ${formatDueDate(task.due_date)}` : null}
        {task.due_date && task.document_title ? " · " : null}
        {task.document_title ?? null}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMarkDone(task.id)}
          data-testid="today-hero-done"
          className="inline-flex h-11 items-center gap-1.5 rounded-ordilo-sm bg-[var(--petrol)] px-4 text-sm font-medium text-[var(--warm-white)] transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Check className="size-4" aria-hidden="true" />
          Erledigt
        </button>
        <Link
          href="/aufgaben"
          className="inline-flex h-11 items-center rounded-ordilo-sm px-3 text-sm font-medium text-[var(--mist-dark)] transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Details
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
  icon: LucideIcon;
  text: string;
  tone: "apricot" | "petrol";
}) {
  return (
    <span
      data-testid="today-hero-label"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        tone === "apricot" ? "text-[var(--apricot-text)]" : "text-[var(--petrol)]",
      )}
    >
      <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
      {text}
    </span>
  );
}
