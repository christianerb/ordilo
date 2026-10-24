"use client";

import { recordDailyAppOpen } from "@/lib/analytics/product-events";
import { nextBerlinMidnight } from "@/lib/berlin-date";
import { createClient } from "@/lib/supabase/client";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/** Slack after midnight so the new Berlin day has surely begun. */
const MIDNIGHT_SLACK_MS = 5_000;

/**
 * Records "app opened" on mount, whenever the tab becomes visible again,
 * and at Berlin midnight while the tab stays visible — so a tab left open
 * overnight still counts the new day. recordDailyAppOpen turns repeat
 * calls on the same day into no round trip.
 * Mount it with `key={familyId}` so a family created later re-mounts it.
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

    record();
    scheduleMidnight();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(midnightTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });
  return null;
}
