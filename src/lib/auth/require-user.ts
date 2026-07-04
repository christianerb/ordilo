import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Result of an authenticated API request guard.
 */
export type RequireUserResult =
  | { user: User; status: null; json: null }
  | { user: null; status: 401; json: { error: string; code: string } };

/**
 * Guard for API route handlers that require an authenticated Supabase
 * session. Returns the user when authenticated, or a structured 401
 * response body when not.
 *
 * Usage in a route handler:
 *
 * ```ts
 * const auth = await requireUser();
 * if (auth.status) return Response.json(auth.json, { status: auth.status });
 * const user = auth.user;
 * ```
 */
export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      status: 401,
      json: {
        error: "Nicht authentifiziert. Bitte erneut anmelden.",
        code: "UNAUTHENTICATED",
      },
    };
  }

  return { user, status: null, json: null };
}
