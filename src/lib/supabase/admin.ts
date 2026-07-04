import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client.
 *
 * Bypasses RLS. Use ONLY in API routes / server contexts where
 * service-level access is required (e.g. Storage uploads, admin
 * operations). NEVER expose this client or the service role key to the
 * browser — it is a server-only secret.
 */
export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
