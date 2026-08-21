import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/types/database";
import {
  FAMILY_ID_HEADER,
  FAMILY_NAME_HEADER,
  USER_EMAIL_HEADER,
} from "@/lib/supabase/family-context";

/**
 * Extract a Supabase access token from an `Authorization: Bearer …` header,
 * if the request carries one.
 *
 * The native mobile app (apps/mobile) holds its Supabase session in the OS
 * keychain, not in cookies, and authenticates API requests with this
 * header. Browsers never send it, so cookie auth stays the default.
 */
export async function getBearerToken(): Promise<string | null> {
  const headerList = await headers();
  const raw = headerList.get("authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(raw.trim());
  return match ? match[1] : null;
}

/**
 * Request-scoped client for a caller authenticated via bearer token. The
 * token rides in a global Authorization header, so `auth.getUser()`
 * validates it against the auth server and every PostgREST/Storage query
 * runs under RLS exactly as a browser cookie session would.
 */
export function createBearerClient(accessToken: string) {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
  );
}

/**
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Reads auth cookies from the incoming request so that the session is
 * shared with the browser client. When the request instead carries an
 * `Authorization: Bearer …` header (native mobile app), the returned
 * client is scoped to that token. Always create a new client per request —
 * never share across requests.
 */
export async function createClient() {
  const bearerToken = await getBearerToken();
  if (bearerToken) {
    return createBearerClient(bearerToken);
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing the
            // user session — which we do (src/middleware.ts).
          }
        },
      },
    },
  );
}

/**
 * Read the family the middleware already verified for this request, if any.
 *
 * On full page loads of app routes the middleware runs a `families` query
 * for the onboarding gate and forwards the result via request headers, so
 * pages can skip re-running the identical query. On RSC navigations (SPA
 * tab switches) the middleware skips its check, the headers are absent,
 * and callers must fall back to their own query.
 *
 * Returns null when the headers are absent — never trust them otherwise:
 * the middleware strips spoofed incoming values before setting its own.
 */
export async function getMiddlewareFamily(): Promise<{
  id: string;
  name: string;
} | null> {
  const headerList = await headers();
  const id = headerList.get(FAMILY_ID_HEADER);
  if (!id) return null;

  const encodedName = headerList.get(FAMILY_NAME_HEADER) ?? "";
  let name = encodedName;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    // Malformed encoding — fall back to the raw header value.
  }
  return { id, name };
}

/**
 * Read the authenticated user's email as forwarded by the middleware, if
 * any. Only set on full page loads when a family was found (same branch
 * as the family headers); absent on RSC navigations. Returns null when
 * the header is missing or empty.
 */
export async function getMiddlewareUserEmail(): Promise<string | null> {
  const headerList = await headers();
  const encoded = headerList.get(USER_EMAIL_HEADER);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    // Malformed encoding — fall back to the raw header value.
    return encoded;
  }
}
