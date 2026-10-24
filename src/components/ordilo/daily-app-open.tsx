"use client";

import { usePathname } from "next/navigation";
import { recordDailyAppOpen } from "@/lib/analytics/product-events";
import { nextBerlinMidnight } from "@/lib/berlin-date";
import { createClient } from "@/lib/supabase/client";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/** Slack after midnight so the new Berlin day has surely begun. */
const MIDNIGHT_SLACK_MS = 5_000;

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
      midnightTimer = setTimeout(() => {
        if (document.visibilityState === "visible") record();
        scheduleMidnight();
      }, nextBerlinMidnight(Date.now()) - Date.now() + MIDNIGHT_SLACK_MS);
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
