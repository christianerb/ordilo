import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  resolveUserFamily,
  type ResolvedFamily,
} from "./family";
import { AppState } from "react-native";
import { retainOfflineFamily } from "./offline-documents";
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
  const [state, setState] = useState<{ userId: string | null; family: ResolvedFamily | null; isLoading: boolean; error: string | null }>({ userId: null, family: null, isLoading: true, error: null });
  // A response can only update the account and request that started it.
  const fetchSeqRef = useRef(0);

  const fetchFamily = useCallback(async (uid: string | null, background = false) => {
    const seq = ++fetchSeqRef.current;
    if (!uid) {
      setState({ userId: null, family: null, error: null, isLoading: false });
      return;
    }
    if (!background) setState((current) => ({ userId: uid, family: current.userId === uid ? current.family : null, error: null, isLoading: true }));
    try {
      const result = await resolveUserFamily(getSupabase() as SupabaseClient, uid);
      if (seq !== fetchSeqRef.current) return;
      if (!result.error) {
        // Runs on every successful lookup, including cold start, so saved
        // copies from a former family cannot reappear after an app restart.
        await retainOfflineFamily(uid, result.data?.id ?? null).catch(() => {});
      }
      if (seq !== fetchSeqRef.current) return;
      setState((current) => background && result.error && current.userId === uid && current.family
        ? { ...current, isLoading: false }
        : { userId: uid, family: result.data, error: result.error, isLoading: false });
    } catch {
      if (seq !== fetchSeqRef.current) return;
      setState((current) => background && current.userId === uid && current.family
        ? { ...current, isLoading: false }
        : { userId: uid, family: null, error: "Deine Familie konnte nicht geladen werden. Bitte versuch es nochmal.", isLoading: false });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) void fetchFamily(userId); });
    const listener = AppState.addEventListener("change", (next) => {
      if (next === "active" && !cancelled) void fetchFamily(userId, true);
    });
    return () => {
      cancelled = true;
      fetchSeqRef.current += 1;
      listener.remove();
    };
  }, [userId, fetchFamily]);

  /**
   * Re-resolve on demand. The user id is read from the stored session AT
   * CALL TIME, not from the render closure: the invite screen accepts an
   * invite right after verifyOtp, when this closure's userId is still
   * null but getSession() already returns the new account.
   */
  const refresh = useCallback(async () => {
    const {
      data: { session: current },
    } = await getSupabase().auth.getSession();
    await fetchFamily(current?.user?.id ?? null);
  }, [fetchFamily]);

  const markIntroSeenLocally = useCallback(() => {
    setState((current) => current.userId === userId && current.family
      ? { ...current, family: { ...current.family, introSeenAt: new Date().toISOString() } }
      : current);
  }, [userId]);

  // Hide a previous account synchronously, before the new lookup effect runs.
  const family = state.userId === userId ? state.family : null;
  const isLoading = state.userId === userId ? state.isLoading : true;
  const error = state.userId === userId ? state.error : null;
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
