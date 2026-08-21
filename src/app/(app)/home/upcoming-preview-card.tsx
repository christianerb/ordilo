"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { UpcomingPreviewItem } from "@/lib/home-events";
import { HOME_EVENTS_HORIZON_DAYS } from "@/lib/home-events";

/**
 * "Demnächst" — a one-line preview of what's coming later this week, so
 * a glance at Home answers "is anything else brewing?" without opening
 * the planner. Deliberately just a count plus up to two names, not a
 * second list: "Heute" already gets the full timeline treatment.
 */
export function UpcomingPreviewCard({
  items,
}: {
  items: UpcomingPreviewItem[];
}) {
  if (items.length === 0) return null;

  const previewTitles = items.slice(0, 2).map((item) => item.title);

  return (
    <Link
      href="/aufgaben?tab=planer"
      data-testid="home-upcoming-preview"
      className="flex items-center gap-3 rounded-ordilo-md border border-white/80 bg-[var(--surface-box)] px-4 py-3 shadow-card transition-shadow hover:shadow-card-hover focus-ring"
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--wash-sage)]"
        aria-hidden="true"
      >
        <CalendarDays
          className="size-4"
          style={{ color: "var(--petrol)" }}
          strokeWidth={1.8}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Demnächst</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "Ding" : "Dinge"} in den
          nächsten {HOME_EVENTS_HORIZON_DAYS} Tagen
          {previewTitles.length > 0 && <> · {previewTitles.join(", ")}</>}
        </p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
