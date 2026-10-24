"use client";

import { usePathname } from "next/navigation";
import { recordDailyAppOpen } from "@/lib/analytics/product-events";
import { nextBerlinMidnight } from "@/lib/berlin-date";
import { createClient } from "@/lib/supabase/client";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/** Slack after midnight so the new Berlin day has surely begun. */
const MIDNIGHT_SLACK_MS = 5_000;
/** Re-check interval when the Berlin midnight cannot be computed. */
const FALLBACK_RECHECK_MS = 60 * 60 * 1000;

/**
 * Records "app opened" on a visible mount, whenever the tab becomes visible,
 * and at Berlin midnight while the tab stays visible — so a tab left open
 * overnight still counts the new day. recordDailyAppOpen turns repeat
 * calls on the same day into no round trip.
 * Mounted through DailyAppOpenTracker, which re-mounts it per family.
 */
export function DailyAppOpen({ familyId }: { familyId: string }) {
  useMountEffect(() => {
    const supabase = createClient();
    const record = () => void recordDailyAppOpen(supabase, { familyId });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") record();
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
        if (document.visibilityState === "visible") record();
        scheduleMidnight();
      }, delay);
    };

    // A tab restored or opened in the background is not a visit yet.
    if (document.visibilityState === "visible") record();
    scheduleMidnight();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(midnightTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });
  return null;
}

/**
 * Mounts DailyAppOpen once a family exists and setup is done. The
 * onboarding route is the only (app) page without finished setup; leaving
 * it mounts the recorder, so the day of finishing onboarding counts too.
 */
export function DailyAppOpenTracker({ familyId }: { familyId?: string | null }) {
  const pathname = usePathname();
  if (!familyId || pathname?.startsWith("/onboarding")) return null;
  return <DailyAppOpen key={familyId} familyId={familyId} />;
}
