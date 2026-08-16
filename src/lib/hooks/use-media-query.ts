"use client";

import { useState } from "react";

import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Subscribe to a CSS media query.
 *
 * Always reports `false` on the first render — the server has no viewport, so
 * assuming the smaller layout keeps hydration deterministic and lets the
 * desktop branch appear a frame later rather than mismatching. Callers that
 * change layout on the result should therefore treat mobile as the default.
 *
 * The subscription is a browser API lifecycle, one of the sanctioned uses for
 * `useMountEffect` (see that hook's note on the no-useEffect rule).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useMountEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    // Safari < 14 only has the deprecated listener API.
    media.addListener(sync);
    return () => media.removeListener(sync);
  });

  return matches;
}

/** The breakpoint at which a detail drawer moves from the bottom to the side. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** True once the viewport is wide enough for side-anchored drawers. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
