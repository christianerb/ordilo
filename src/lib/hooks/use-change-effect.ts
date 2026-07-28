import { useEffect } from "react";

/**
 * Run a side effect on mount AND whenever one of the dependencies changes.
 *
 * Companion to useMountEffect (the only other sanctioned effect wrapper)
 * for the rare case where a side effect genuinely tracks an external
 * value — e.g. incrementally fetching data for a changing set of entity
 * IDs, where deriving during render is impossible and key-remounting the
 * component would destroy unrelated local state (filters, sort, focus).
 *
 * Everything from useMountEffect's contract still applies: this is NOT a
 * license to sync React state with React state. Valid use cases are DOM
 * integration, browser-API subscriptions, and external-data fetches that
 * must react to identity changes.
 */
export function useChangeEffect(
  effect: () => void | (() => void),
  deps: readonly unknown[],
): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, deps);
}
