import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { getSupabase } from "./supabase";

interface SessionContextValue {
  session: Session | null;
  /** True until the persisted session has been read from secure storage. */
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoading: true,
  signOut: async () => {},
});

type SignOutAuth = Pick<ReturnType<typeof getSupabase>["auth"], "signOut">;

export async function signOutSession(auth: SignOutAuth): Promise<void> {
  try {
    await auth.signOut();
  } catch {
    // Account deletion can remove the server-side auth user before this
    // call. Clear the persisted native session even when remote revocation
    // can no longer succeed.
    await auth.signOut({ scope: "local" });
  }
}

/**
 * Loads the persisted Supabase session once, keeps it in sync via
 * onAuthStateChange, and ties token refresh to the app being in the
 * foreground (Supabase's recommended React Native wiring).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch(() => {
        // Secure storage can reject (e.g. keychain unavailable). Treat the
        // app as logged out, but never leave isLoading stuck on true.
      })
      .finally(() => {
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    supabase.auth.startAutoRefresh();

    return () => {
      subscription.unsubscribe();
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      signOut: async () => {
        await signOutSession(getSupabase().auth);
      },
    }),
    [session, isLoading],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
