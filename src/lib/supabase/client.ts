import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Browser-side Supabase client.
 *
 * Uses the publishable (anon) key — safe to expose to the client.
 * Reads/writes auth cookies via @supabase/ssr so that the session is
 * shared with the server-side client (middleware, server components,
 * route handlers).
 *
 * Singleton by default: repeated calls return the same instance.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
