import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Refresh the Supabase auth session on every matched request and protect
 * authenticated routes.
 *
 * - Calls `supabase.auth.getUser()` which refreshes the access token when
 *   needed and writes the updated cookies back to the response.
 * - Redirects unauthenticated visitors trying to reach a protected `(app)`
 *   route to `/login`.
 *
 * Returns the modified `NextResponse` so that the refreshed cookies
 * propagate to the browser.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run logic between `createServerClient` and `getUser`.
  // A simple mistake can make it very hard to debug auth issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes — anything under the `(app)` route group resolves to
  // these top-level paths. Unauthenticated visitors are sent to /login.
  const protectedPaths = [
    "/home",
    "/scan",
    "/suche",
    "/familie",
    "/aufgaben",
    "/onboarding",
  ];
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirected", "true");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
