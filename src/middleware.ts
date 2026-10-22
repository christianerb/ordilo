import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  hasSupabaseSessionCookie,
  isPublicMarketingPath,
} from "@/lib/public-routes";

/**
 * Next.js middleware entry point.
 *
 * Runs on every matched request, refreshes the Supabase auth session, and
 * protects `(app)` routes from unauthenticated access. Public marketing
 * pages skip Supabase so they are served straight from the static cache;
 * the landing page only checks the session when an auth cookie exists, so
 * signed-in users still land in the app.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicMarketingPath(pathname)) return NextResponse.next();
  if (pathname === "/" && !hasSupabaseSessionCookie(request)) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (route handlers authenticate themselves via requireUser() —
     *   running the middleware's auth.getUser() on top added a full
     *   Supabase Auth round-trip to every single API call)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (svg, png, jpg, etc.)
     *
     * The auth callback (/auth/callback) is NOT under /api, so it stays
     * matched and the session is still refreshed before it runs.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|csv|mp4)$).*)",
  ],
};
