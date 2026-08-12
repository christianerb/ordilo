import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Run a side effect exactly once on mount.
 *
 * This is the ONLY sanctioned wrapper around `useEffect` in the codebase.
 * Direct `useEffect` usage is banned per the Factory no-useEffect rule:
 * it forces declarative, predictable logic instead of dependency-array
 * choreography that hides coupling and breeds race conditions.
 *
 * Valid use cases (from "You Might Not Need an Effect"):
 *   - DOM integration (focus, scroll, scrollIntoView)
 *   - Browser API subscriptions (matchMedia, IntersectionObserver)
 *   - Third-party widget lifecycles
 *
 * If the effect needs to re-run when a prop/state changes, use a `key`
 * prop to force a clean remount instead of a dependency array.
 */
export function useMountEffect(effect: () => void | (() => void)): void {
  const effectRef = useRef(effect);
  useEffect(() => effectRef.current(), []);
}

/**
 * Like {@link useMountEffect}, but runs BEFORE the browser paints
 * (layout effect on the client, no-op-safe on the server).
 *
 * Use this for DOM measurements whose result must be in place for the
 * very first frame — e.g. publishing a measured element's height to a
 * CSS variable that layout depends on. With a paint-time effect the
 * first frame renders with the fallback value and snaps to the measured
 * one a frame later, which is a visible layout shift (CLS).
 */
const useIsomorphicLayoutMountEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useMountLayoutEffect(effect: () => void | (() => void)): void {
  const effectRef = useRef(effect);
  useIsomorphicLayoutMountEffect(() => effectRef.current(), []);
}
