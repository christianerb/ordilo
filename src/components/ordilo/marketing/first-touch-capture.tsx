"use client";

import { captureFirstTouch } from "@/lib/analytics/first-touch";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Captures the first touch as soon as the first page of a tab mounts, so
 * pages without a signup link still contribute their UTM tags and landing
 * path. Renders nothing and stores nothing on the device.
 */
export function FirstTouchCapture() {
  useMountEffect(() => {
    captureFirstTouch();
  });
  return null;
}
