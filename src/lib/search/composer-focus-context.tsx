"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { useChangeEffect } from "@/lib/hooks/use-change-effect";

/**
 * Lets a page ask "the composer" to respond to a request like "open and
 * focus", without owning the composer itself (it is a fixed element in
 * the app shell, mounted alongside every page — see
 * suggestion-chips-context.tsx for the same cross-tree-communication
 * shape, used for the same reason).
 *
 * Two composer variants are mounted at once (MobileComposer below `lg`,
 * DesktopBottomBar at `lg` and up — both stay in the DOM across the
 * breakpoint, CSS just hides the inactive one), so registration supports
 * any number of concurrent handlers rather than a single slot: every
 * registered handler fires on each request, and each one is responsible
 * for knowing whether it currently applies (e.g. MobileComposer no-ops
 * when its overlay is disabled).
 *
 * The default value is a no-op so components work without the provider
 * (unit tests render pages in isolation).
 */

interface ComposerFocusContextValue {
  registerHandler: (handler: () => void) => () => void;
  /** Ask every registered composer to respond — a no-op if none has
      registered yet. */
  requestFocus: () => void;
}

const ComposerFocusContext = createContext<ComposerFocusContextValue>({
  registerHandler: () => () => {},
  requestFocus: () => {},
});

export function ComposerFocusProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Set<() => void>>(new Set());
  const value = useMemo<ComposerFocusContextValue>(
    () => ({
      registerHandler: (handler) => {
        handlersRef.current.add(handler);
        return () => {
          handlersRef.current.delete(handler);
        };
      },
      requestFocus: () => {
        for (const handler of handlersRef.current) handler();
      },
    }),
    [],
  );
  return (
    <ComposerFocusContext.Provider value={value}>
      {children}
    </ComposerFocusContext.Provider>
  );
}

/** Call to ask the composer to open/focus. */
export function useComposerFocusRequest(): () => void {
  return useContext(ComposerFocusContext).requestFocus;
}

/**
 * Registers a composer's own "respond to a focus request" handler.
 *
 * Re-registers whenever `handler`'s identity changes (via useChangeEffect
 * — the sanctioned escape hatch from useMountEffect for a side effect that
 * genuinely tracks an external value, see lib/hooks/use-change-effect.ts)
 * rather than only once on mount: MobileComposer's handler closes over
 * `enableOverlay`, which can flip between routes without remounting the
 * persistent app-shell composer, and a mount-only registration would keep
 * calling the stale, first-mount version of that check forever. Callers
 * should memoize `handler` (useCallback) so it only changes identity when
 * the logic it captures actually changes.
 */
export function useRegisterComposerFocusHandler(handler: () => void): void {
  const { registerHandler } = useContext(ComposerFocusContext);
  useChangeEffect(() => registerHandler(handler), [handler]);
}
