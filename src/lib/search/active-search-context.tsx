"use client";

import { createContext, useCallback, useContext, useRef } from "react";
import { useRouter } from "next/navigation";

type QueryHandler = (query: string) => void;

export interface ActiveSearchContextValue {
  /**
   * Register the /suche page's live submit handler so the global topbar
   * can hand a query straight to the active conversation instead of
   * navigating away and losing thread continuity. SucheClient calls this
   * on every render (a plain ref write, safe during render — mirrors the
   * `handleSubmitRef` pattern already used inside suche-client.tsx) and
   * clears it (`null`) on unmount.
   */
  setActiveHandler: (handler: QueryHandler | null) => void;
  /**
   * Submit a query from anywhere in the app: forwards to the mounted
   * /suche conversation when one is registered, otherwise navigates to
   * `/suche?q=...` (which auto-submits there on load).
   */
  submitQuery: (query: string) => void;
}

const ActiveSearchContext = createContext<ActiveSearchContextValue | null>(
  null,
);

/**
 * Provides a single, app-wide entry point for "ask Ordilo a question" —
 * the global topbar search field calls `submitQuery` on every route. When
 * the /suche page happens to be mounted, the query is handed directly to
 * its live conversation (no navigation, no lost context); otherwise the
 * user is routed to /suche with the query pre-filled.
 */
export function ActiveSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const handlerRef = useRef<QueryHandler | null>(null);

  const setActiveHandler = useCallback((handler: QueryHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const submitQuery = useCallback(
    (query: string) => {
      if (handlerRef.current) {
        handlerRef.current(query);
        return;
      }
      router.push(`/suche?q=${encodeURIComponent(query)}`);
    },
    [router],
  );

  return (
    <ActiveSearchContext.Provider value={{ setActiveHandler, submitQuery }}>
      {children}
    </ActiveSearchContext.Provider>
  );
}

/** Access the shared search entry point. Must be used within {@link ActiveSearchProvider}. */
export function useActiveSearch(): ActiveSearchContextValue {
  const ctx = useContext(ActiveSearchContext);
  if (!ctx) {
    throw new Error("useActiveSearch must be used within an ActiveSearchProvider");
  }
  return ctx;
}
