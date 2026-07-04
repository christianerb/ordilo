import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * TEMPORARY dev-only route to establish a Supabase session for E2E
 * browser testing without the magic-link email flow.
 *
 * Uses the admin API to generate a magic link, follows the redirect to
 * extract access/refresh tokens, then calls setSession() to write the
 * auth cookies directly on the redirect response. Redirects to /home.
 *
 * This route is removed after verification. It should never be deployed.
 */

const TEST_EMAIL = "ordilo.auth.test@gmail.com";

export async function GET() {
  const admin = createAdminClient();

  // Generate a magic link for the test user.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to generate link", detail: error?.message },
      { status: 500 },
    );
  }

  const actionLink = data.properties?.action_link;
  if (!actionLink) {
    return NextResponse.json(
      { error: "No action link returned" },
      { status: 500 },
    );
  }

  // Follow the action link manually (don't auto-redirect) to capture
  // the Location header which contains #access_token=...&refresh_token=...
  const verifyResponse = await fetch(actionLink, {
    redirect: "manual",
  });

  const locationHeader = verifyResponse.headers.get("location");
  if (!locationHeader) {
    return NextResponse.json(
      { error: "No redirect in verify response", status: verifyResponse.status },
      { status: 500 },
    );
  }

  // Extract tokens from the hash fragment of the redirect URL.
  const hashPart = locationHeader.split("#")[1];
  if (!hashPart) {
    return NextResponse.json(
      { error: "No hash fragment in redirect", location: locationHeader },
      { status: 500 },
    );
  }

  const params = new URLSearchParams(hashPart);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      { error: "No tokens in redirect hash" },
      { status: 500 },
    );
  }

  // Create the redirect response FIRST, then set cookies on it.
  // This ensures the auth cookies are carried by the redirect response
  // to the browser. (Using cookies().set() separately does NOT propagate
  // to a NextResponse.redirect() — they go to different response objects.)
  const response = NextResponse.redirect(
    new URL("/home", "http://localhost:3100"),
  );

  // Create a server client that writes cookies directly on the redirect
  // response. The setSession call will populate the auth cookies.
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return response.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    return NextResponse.json(
      { error: "Failed to set session", detail: sessionError.message },
      { status: 500 },
    );
  }

  return response;
}
