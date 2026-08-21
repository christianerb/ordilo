"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Lets a page ask the global mobile composer to open its "ask anything"
 * overlay, without owning the composer itself (it is a fixed element in
 * the app shell, mounted alongside every page — see
 * suggestion-chips-context.tsx for the same cross-tree-communication
 * shape, used for the same reason).
 *
 * The default value is a no-op so components work without the provider
 * (unit tests render pages in isolation).
 */

interface ComposerFocusContextValue {
  /** The composer registers itself here on mount; only one instance is
      ever mounted at a time. */
  registerHandler: (handler: () => void) => () => void;
  /** Ask the composer to open — a no-op if nothing has registered yet. */
  requestFocus: () => void;
}

const ComposerFocusContext = createContext<ComposerFocusContextValue>({
  registerHandler: () => () => {},
  requestFocus: () => {},
});

export function ComposerFocusProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<(() => void) | null>(null);
  const value = useMemo<ComposerFocusContextValue>(
    () => ({
      registerHandler: (handler) => {
        handlerRef.current = handler;
        return () => {
          if (handlerRef.current === handler) handlerRef.current = null;
        };
      },
      requestFocus: () => handlerRef.current?.(),
    }),
    [],
  );
  return (
    <ComposerFocusContext.Provider value={value}>
      {children}
    </ComposerFocusContext.Provider>
  );
}

/** Call to open the composer's fullscreen "ask anything" overlay. */
export function useComposerFocusRequest(): () => void {
  return useContext(ComposerFocusContext).requestFocus;
}

/** The composer itself registers its open handler while mounted. */
export function useRegisterComposerFocusHandler(handler: () => void): void {
  const { registerHandler } = useContext(ComposerFocusContext);
  useMountEffect(() => registerHandler(handler));
}
