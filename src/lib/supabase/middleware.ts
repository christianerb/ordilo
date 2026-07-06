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
 * - Blocks authenticated users who haven't completed onboarding from
 *   accessing app routes (redirects them to `/onboarding`).
 * - Redirects authenticated users who HAVE completed onboarding away from
 *   `/onboarding` to `/home`.
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

  // Route classification
  const appPaths = ["/home", "/scan", "/suche", "/familie", "/aufgaben"];
  const protectedPaths = [...appPaths, "/onboarding"];
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAppRoute = appPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  // Unauthenticated → redirect to /login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirected", "true");
    return NextResponse.redirect(url);
  }

  // Authenticated → check onboarding status for page navigations (GET only).
  // POST requests are Next.js server actions and must NOT be redirected —
  // redirecting a server action response breaks the action contract and
  // causes "unexpected response" errors on the client.
  if (user && request.method === "GET" && (isAppRoute || isOnboarding)) {
    // Onboarding status is determined by a DURABLE marker
    // (families.onboarding_completed_at) rather than raw member count.
    // This distinguishes "onboarding completed" from "has members":
    //   - A user who completed onboarding but later removed ALL members
    //     still has onboarding_completed_at set → allowed to access /familie
    //     (shows the zero-member empty state, VAL-ONBOARD-026/VAL-FAMILY-004).
    //   - A user who created a family but never completed onboarding has
    //     onboarding_completed_at NULL → kept in /onboarding (mid-onboarding
    //     bypass stays closed).
    //   - A user with no family at all → redirected to /onboarding to start.
    //
    // RLS ensures only the user's own family is visible.
    const { data: family, error: familyError } = await supabase
      .from("families")
      .select("id, onboarding_completed_at")
      .limit(1)
      .maybeSingle();

    // On query error: fail safe — let the request pass through so the page
    // can surface a German error state. Redirecting to /onboarding on a
    // transient failure would misroute the user (e.g. an onboarded user
    // bounced back to onboarding because the DB was briefly unreachable).
    if (familyError) {
      return supabaseResponse;
    }

    // onboarding_complete = family exists AND onboarding_completed_at is set.
    // No family (null) → not complete (user needs to start onboarding).
    // Family with completed_at NULL → not complete (mid-onboarding).
    const onboardingComplete = !!(family && family.onboarding_completed_at);

    if (!onboardingComplete && isAppRoute) {
      // Not onboarded: redirect ALL app routes → /onboarding. This covers
      // both "no family" (user hasn't started) and "family exists but
      // completed_at is NULL" (mid-onboarding). The onboarding page
      // detects the state and resumes at the appropriate step.
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return redirectWithCookies(url, supabaseResponse);
    }

    if (onboardingComplete && isOnboarding) {
      // Onboarding complete: redirect /onboarding → /home
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      url.search = "";
      return redirectWithCookies(url, supabaseResponse);
    }
  }

  return supabaseResponse;
}

/**
 * Create a redirect response that preserves the refreshed auth cookies
 * from the supabase response. This ensures the session cookies are
 * propagated even when we redirect instead of returning supabaseResponse
 * directly.
 *
 * IMPORTANT: All cookie attributes (httpOnly, secure, sameSite, path,
 * expiry/max-age) are preserved from the original response cookies.
 * Copying only { name, value } would drop security-critical attributes
 * (e.g. httpOnly, secure) and break session persistence across redirects.
 */
function redirectWithCookies(url: URL, supabaseResponse: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  // Copy all cookies with their FULL attributes — not just name/value.
  // Destructuring separates name/value from the rest of the cookie options
  // (path, domain, sameSite, secure, httpOnly, expires, maxAge) so they
  // are passed through to the redirect response intact.
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    const { name, value, ...options } = cookie;
    redirectResponse.cookies.set(name, value, options);
  });
  return redirectResponse;
}
