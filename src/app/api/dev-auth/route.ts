import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  ensureEmptyDocumentsFixture,
  EMPTY_FIXTURE_EMAIL,
} from "@/lib/dev-fixtures";
import type { Database } from "@/types/database";

/**
 * TEMPORARY dev-only route to establish a Supabase session for E2E
 * browser testing without the magic-link email flow.
 *
 * Uses the admin API to generate a magic link, follows the redirect to
 * extract access/refresh tokens, then calls setSession() to write the
 * auth cookies directly on the redirect response.
 *
 * Two fixtures are supported via the `?fixture=` query parameter:
 *
 * - `?fixture=empty` (default for empty-state validation):
 *     Signs in as a dedicated, disposable empty-documents fixture user
 *     (`EMPTY_FIXTURE_EMAIL`) that has exactly one family and zero
 *     documents. The fixture is reset to zero documents on every call
 *     without touching any shared validation family. Redirects to
 *     `/scan` so the validator lands directly on the scan page.
 *
 * - no parameter / any other value (shared test user):
 *     Signs in as the shared test user (`TEST_EMAIL`). Redirects to
 *     `/home`. Use this for general validation that needs the shared
 *     family and its members.
 *
 * This route should never be deployed. It exists solely to make
 * browser-based validation reliable in the local dev environment.
 */

/** Shared test user (has a family + members). */
const TEST_EMAIL = "ordilo.auth.test@gmail.com";

/** Base URL for building redirect targets. */
const BASE_URL = "http://localhost:3100";

/**
 * Establish a Supabase session for the given email by generating a magic
 * link, following it to extract tokens, and writing auth cookies onto a
 * redirect response. An optional `onUser` hook runs after the user id is
 * known but before the token exchange — used to prepare the empty fixture.
 *
 * @returns A redirect NextResponse with auth cookies set, or a 500 JSON
 *   error response on any failure.
 */
async function establishSession(options: {
  email: string;
  redirectPath: string;
  onUser?: (userId: string) => Promise<void>;
}): Promise<NextResponse> {
  const { email, redirectPath, onUser } = options;
  const admin = createAdminClient();

  // Generate a magic link for the user (creates the user if absent).
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
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

  const userId = data.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "No user returned from generateLink" },
      { status: 500 },
    );
  }

  // Optional hook — e.g. ensure the empty fixture has zero documents.
  if (onUser) {
    try {
      await onUser(userId);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Fixture preparation failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }
  }

  // Follow the action link manually (don't auto-redirect) to capture
  // the Location header which contains #access_token=...&refresh_token=...
  const verifyResponse = await fetch(actionLink, {
    redirect: "manual",
  });

  const locationHeader = verifyResponse.headers.get("location");
  if (!locationHeader) {
    return NextResponse.json(
      {
        error: "No redirect in verify response",
        status: verifyResponse.status,
      },
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
  const response = NextResponse.redirect(new URL(redirectPath, BASE_URL));

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fixture = url.searchParams.get("fixture");

  if (fixture === "empty") {
    // Disposable empty-documents fixture — reset to zero documents and
    // land on /scan so the validator sees the warm empty state.
    return establishSession({
      email: EMPTY_FIXTURE_EMAIL,
      redirectPath: "/scan",
      onUser: async (userId) => {
        await ensureEmptyDocumentsFixture(userId);
      },
    });
  }

  // Default: shared test user → /home.
  return establishSession({
    email: TEST_EMAIL,
    redirectPath: "/home",
  });
}
