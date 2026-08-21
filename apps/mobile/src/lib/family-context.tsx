import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  resolveUserFamily,
  type ResolvedFamily,
} from "./family";
import { getSupabase } from "./supabase";
import { useSession } from "./session";

interface FamilyContextValue {
  family: ResolvedFamily | null;
  /** True while the family is being resolved (after login or refresh). */
  isLoading: boolean;
  /** Friendly German message when the lookup failed, null otherwise. */
  error: string | null;
  /** Re-resolve after onboarding, joining a family, or the welcome intro. */
  refresh: () => Promise<void>;
  /**
   * Dismiss the welcome intro locally when the server write failed, so
   * the app gate cannot bounce the user back into a willkommen loop. A
   * later refresh re-reads the server state — worst case the intro shows
   * once more in a future session (same trade-off as the web).
   */
  markIntroSeenLocally: () => void;
}

const FamilyContext = createContext<FamilyContextValue>({
  family: null,
  isLoading: true,
  error: null,
  refresh: async () => {},
  markIntroSeenLocally: () => {},
});

/**
 * Resolves the signed-in user's family once per session and on demand.
 * Feeds the app gate: no family → onboarding, incomplete owner setup →
 * onboarding, invited member with pending intro → welcome screen.
 */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const [family, setFamily] = useState<ResolvedFamily | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFamily = useCallback(async (uid: string | null) => {
    if (!uid) {
      setFamily(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const result = await resolveUserFamily(getSupabase() as SupabaseClient, uid);
    setFamily(result.data);
    setError(result.error);
    setIsLoading(false);
  }, []);

  // Load once per signed-in user. The microtask hop keeps the synchronous
  // setState out of the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchFamily(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, fetchFamily]);

  const refresh = useCallback(() => fetchFamily(userId), [fetchFamily, userId]);

  const markIntroSeenLocally = useCallback(() => {
    setFamily((current) =>
      current ? { ...current, introSeenAt: new Date().toISOString() } : current,
    );
  }, []);

  const value = useMemo<FamilyContextValue>(
    () => ({ family, isLoading, error, refresh, markIntroSeenLocally }),
    [family, isLoading, error, refresh, markIntroSeenLocally],
  );

  return (
    <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
  );
}

export function useFamily(): FamilyContextValue {
  return useContext(FamilyContext);
}
