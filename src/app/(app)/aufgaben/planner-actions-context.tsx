"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";

type CreateHandler = () => void;

export interface PlannerActionsContextValue {
  /**
   * Register the mounted tab view's open-create handler. Tab clients call
   * this in a mount effect and clear it (null) on unmount — only one tab
   * view is mounted at a time, so a single slot is enough.
   */
  setCreateHandler: (handler: CreateHandler | null) => void;
  /** Open the create sheet of whichever tab view is currently mounted. */
  openCreate: () => void;
}

const PlannerActionsContext =
  createContext<PlannerActionsContextValue | null>(null);

/**
 * Lets the Familienplaner page header offer the primary "create" action
 * (Neue Aufgabe / Termin) while the actual sheets live inside the tab
 * clients — same registration pattern as ActiveSearchContext.
 */
export function PlannerActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const handlerRef = useRef<CreateHandler | null>(null);

  const setCreateHandler = useCallback((handler: CreateHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const openCreate = useCallback(() => {
    handlerRef.current?.();
  }, []);

  return (
    <PlannerActionsContext.Provider value={{ setCreateHandler, openCreate }}>
      {children}
    </PlannerActionsContext.Provider>
  );
}

/** Access the planner actions. Must be used within {@link PlannerActionsProvider}. */
export function usePlannerActions(): PlannerActionsContextValue {
  const ctx = useContext(PlannerActionsContext);
  if (!ctx) {
    throw new Error(
      "usePlannerActions must be used within a PlannerActionsProvider",
    );
  }
  return ctx;
}

/**
 * Optional variant for the tab clients: they register their handler when a
 * provider is present, but must also render standalone (unit tests, any
 * future reuse outside the planner page).
 */
export function usePlannerActionsOptional(): PlannerActionsContextValue | null {
  return useContext(PlannerActionsContext);
}
