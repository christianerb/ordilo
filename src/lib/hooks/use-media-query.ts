"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * `useSyncExternalStore` rather than state plus a mount effect, because the
 * effect version reports `false` on the first client render and corrects
 * itself a frame later. Anything that changes layout on the result — a drawer
 * choosing its anchor, say — would then have to either flicker or re-mount.
 * Here the client reads the real value on its very first render, while the
 * server snapshot stays `false` so hydration still matches.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const media = window.matchMedia(query);
      media.addEventListener?.("change", onStoreChange);
      return () => media.removeEventListener?.("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** The breakpoint at which a detail drawer moves from the bottom to the side. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** True once the viewport is wide enough for side-anchored drawers. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

/** True when the user asks interfaces to avoid positional motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
