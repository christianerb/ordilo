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
    // Onboarding is "complete" when at least one family member exists.
    // A single query is sufficient: if family_members returns a row, the
    // user has both a family and a member. RLS ensures only the user's
    // own data is visible.
    const { data: member } = await supabase
      .from("family_members")
      .select("id")
      .limit(1)
      .maybeSingle();

    const onboardingComplete = !!member;

    if (!onboardingComplete && isAppRoute) {
      // Mid-onboarding: block access to app routes → redirect to /onboarding
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
 */
function redirectWithCookies(url: URL, supabaseResponse: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  // Copy all cookies (including refreshed auth tokens) to the redirect.
  supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
    redirectResponse.cookies.set(name, value);
  });
  return redirectResponse;
}
