"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeTimelineItem } from "@/lib/home-events";

/** Format "HH:MM:SS" or "HH:MM" as "HH:MM". */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

/**
 * "Heute" — the day's fixed appointments and open tasks in one vertical
 * timeline, connected by a line like a journal margin. Appointments carry
 * their real clock time; a task due today has no time of its own, so its
 * row reads "Heute" instead of inventing one.
 *
 * The hero above already calls out the single most urgent task — this
 * list is deliberately the fuller picture (the whole day), so the same
 * task can appear in both without it being a mistake: the hero says
 * "do this first", the timeline says "here's everything today".
 */
export function HomeTimeline({ items }: { items: HomeTimelineItem[] }) {
  if (items.length === 0) return null;

  return (
    <section
      data-testid="home-timeline"
      className="overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--surface-box)] px-4 py-3 shadow-card"
    >
      <div className="flex items-center justify-between gap-3 pb-2">
        <h2 className="text-sm font-semibold text-foreground">Heute</h2>
        <Link
          href="/aufgaben?tab=planer"
          className="shrink-0 text-xs font-medium text-[var(--petrol)] transition-colors hover:text-[var(--petrol-dark)] focus-ring"
        >
          Alle anzeigen
        </Link>
      </div>
      <ul className="flex flex-col" data-testid="home-timeline-list">
        {items.map((item, index) => (
          <TimelineRow
            key={item.id}
            item={item}
            isLast={index === items.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

function TimelineRow({
  item,
  isLast,
}: {
  item: HomeTimelineItem;
  isLast: boolean;
}) {
  const href =
    item.kind === "event" ? "/aufgaben?tab=planer" : `/aufgaben?task=${item.task.id}`;
  const timeLabel =
    item.kind === "event"
      ? item.occurrence.all_day || !item.occurrence.starts_time
        ? "Ganztägig"
        : formatTime(item.occurrence.starts_time)
      : "Heute";
  const title = item.kind === "event" ? item.occurrence.title : item.task.title;
  const subtitle =
    item.kind === "event"
      ? item.occurrence.attendee_names.join(" & ") || item.occurrence.location
      : item.task.description;
  const dotTone = item.kind === "task" ? "bg-[var(--apricot)]" : "bg-[var(--petrol)]";

  return (
    <li>
      <Link
        href={href}
        data-testid="home-timeline-row"
        className="group flex items-start gap-3 py-2.5 focus-ring"
      >
        <div className="flex w-14 shrink-0 flex-col items-end pt-0.5 text-right">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {timeLabel}
          </span>
        </div>
        <div className="relative flex shrink-0 flex-col items-center self-stretch">
          <span
            className={cn("mt-1.5 size-2 shrink-0 rounded-full", dotTone)}
            aria-hidden="true"
          />
          {!isLast && (
            <span
              className="mt-1 w-px flex-1 bg-[var(--mist-light)]"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
