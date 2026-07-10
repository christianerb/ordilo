import { useEffect } from "react";

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
