import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/auth/routing";

/**
 * Magic link callback route.
 *
 * Supabase redirects the user here with `?code=...` after they click the
 * magic link in the email. This route exchanges the PKCE code for a
 * session via @supabase/ssr (setting auth cookies), then redirects to the
 * post-auth destination:
 *
 * - First-time user (no `families` row) → `/onboarding`
 * - Returning user (has `families` row) → `/home`
 *
 * Expired, already-used, or malformed magic links redirect to the
 * auth-error page with a German message. No access/refresh tokens are
 * left in the URL — they are stored in cookies only.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // Malformed callback — no code present.
  if (!code || code.trim() === "") {
    return NextResponse.redirect(buildErrorUrl(requestUrl));
  }

  const supabase = await createClient();

  // Exchange the PKCE code for a session. This sets the auth cookies.
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired, already-used, or otherwise invalid code.
    return NextResponse.redirect(buildErrorUrl(requestUrl));
  }

  // Session established — determine first-time vs returning user.
  const { destination } = await getPostAuthDestination(supabase);

  const destinationUrl = new URL(requestUrl);
  destinationUrl.pathname = destination;
  destinationUrl.search = "";

  return NextResponse.redirect(destinationUrl);
}

function buildErrorUrl(requestUrl: URL): URL {
  const errorUrl = new URL(requestUrl);
  errorUrl.pathname = "/auth/auth-error";
  errorUrl.search = "";
  return errorUrl;
}
