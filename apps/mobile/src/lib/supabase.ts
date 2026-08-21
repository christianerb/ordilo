import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { secureStorage } from "./secure-storage";

let instance: SupabaseClient | null = null;

/**
 * Native Supabase client (singleton).
 *
 * Uses the publishable (anon) key only — RLS protects the data, exactly
 * like the web browser client. The session persists in expo-secure-store
 * (iOS Keychain / Android Keystore) via the chunked adapter.
 *
 * Lazily created so unit tests can import modules without env vars.
 */
export function getSupabase(): SupabaseClient {
  if (instance) return instance;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase ist nicht konfiguriert. EXPO_PUBLIC_SUPABASE_URL und " +
        "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env setzen " +
        "(Vorlage: apps/mobile/.env.example).",
    );
  }

  instance = createClient(url, publishableKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No URL session detection on native — auth happens via the
      // 6-digit email code (verifyOtp) and universal links.
      detectSessionInUrl: false,
    },
  });
  return instance;
}
