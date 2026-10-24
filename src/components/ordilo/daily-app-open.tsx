"use client";

import { usePathname } from "next/navigation";
import { recordDailyAppOpen } from "@/lib/analytics/product-events";
import { nextBerlinMidnight } from "@/lib/berlin-date";
import { createClient } from "@/lib/supabase/client";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/** Slack after midnight so the new Berlin day has surely begun. */
const MIDNIGHT_SLACK_MS = 5_000;
/** What counts as using an already open tab. */
const INTERACTION_EVENTS = ["pointerdown", "keydown"] as const;
/** Re-check interval when the Berlin midnight cannot be computed. */
const FALLBACK_RECHECK_MS = 60 * 60 * 1000;

/**
 * Records "app opened" on a visible mount, whenever the tab becomes visible,
 * and — after Berlin midnight — on the first click or key press in a tab
 * that stayed open, so the new day counts only when someone uses it. recordDailyAppOpen turns repeat
 * calls on the same day into no round trip.
 * Mounted through DailyAppOpenTracker, which re-mounts it per family.
 */
export function DailyAppOpen({ familyId }: { familyId: string | null }) {
  useMountEffect(() => {
    const supabase = createClient();
    let unmounted = false;
    // Not recorded (offline, server error, clock skew): try again on the
    // next click or key press instead of losing the day.
    const record = () =>
      void recordDailyAppOpen(supabase, { familyId }).then((recorded) => {
        if (!recorded && !unmounted) armInteraction();
      });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") record();
    };

    // After midnight an open tab only counts once someone uses it: a tab
    // left on screen overnight is not a visit.
    const onInteraction = () => {
      disarmInteraction();
      record();
    };
    const armInteraction = () => {
      for (const type of INTERACTION_EVENTS) {
        window.addEventListener(type, onInteraction, { passive: true });
      }
    };
    const disarmInteraction = () => {
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, onInteraction);
    };

    let midnightTimer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      let delay = FALLBACK_RECHECK_MS;
      try {
        delay = nextBerlinMidnight(Date.now()) - Date.now() + MIDNIGHT_SLACK_MS;
      } catch {
        // No time zone data in this engine: analytics must never break
        // the page, so fall back to a plain periodic check.
      }
      midnightTimer = setTimeout(() => {
        armInteraction();
        scheduleMidnight();
      }, delay);
    };

    // A tab restored or opened in the background is not a visit yet.
    if (document.visibilityState === "visible") record();
    scheduleMidnight();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      unmounted = true;
      clearTimeout(midnightTimer);
      disarmInteraction();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });
  return null;
}

/**
 * Mounts DailyAppOpen outside onboarding. Onboarding is the only (app)
 * page without finished setup; leaving it mounts the recorder, so the day
 * of finishing onboarding counts too.
 */
export function DailyAppOpenTracker({ familyId }: { familyId?: string | null }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/onboarding")) return null;
  // The layout's familyId can still be null right after onboarding (a soft
  // navigation does not re-render it); record_app_open checks setup and
  // membership itself, so record without one rather than not at all.
  return <DailyAppOpen key={familyId ?? "no-family"} familyId={familyId ?? null} />;
}
