"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE } from "@/lib/invite";

/**
 * Server actions for the invite landing page (`/invite/[token]`).
 *
 * NOTE: "use server" modules may only export async functions.
 */

type ActionResult =
  | { success: true }
  | { success: false; error: string };

type AcceptInviteResult =
  | { success: true }
  | {
      success: false;
      error: string;
      /** Machine-readable reason so the UI can switch to a dedicated screen. */
      reason?: "invalid" | "already_in_family";
    };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TOKEN_REGEX = /^[a-f0-9]{16,64}$/i;

/**
 * Resolve the absolute app base URL for links in auth emails.
 *
 * The configured APP_BASE_URL always wins. Host and forwarded headers are
 * attacker-controllable: building the redirect from them (host-header
 * injection) would send a victim's login link to a hostile origin, leaking
 * the auth code. Only when nothing is configured do we fall back to the
 * request's Origin header, which the browser sets itself for the form POST
 * (same pattern as the digest route: `APP_BASE_URL || request origin`).
 */
function resolveAppBaseUrl(requestHeaders: Headers): string | null {
  const configured = process.env.APP_BASE_URL?.trim();
  const candidate = configured || requestHeaders.get("origin");
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Send a passwordless sign-in code to an invited user.
 *
 * After code verification, the client returns to the invite URL, where the
 * signed-in page accepts the invitation.
 *
 * @param email - The invitee's email address.
 * @param token - The invite token from the URL.
 */
export async function requestInviteSignIn(
  email: string,
  token: string,
): Promise<ActionResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return {
      success: false,
      error: "Bitte gib eine gültige E-Mail-Adresse ein.",
    };
  }
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return { success: false, error: "Die Einladung ist ungültig." };
  }

  const requestHeaders = await headers();
  const baseUrl = resolveAppBaseUrl(requestHeaders);
  if (!baseUrl) {
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60,
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) {
    cookieStore.delete(INVITE_COOKIE);
    return {
      success: false,
      error: "E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.",
    };
  }

  return { success: true };
}

/**
 * Accept a family invite for the signed-in user.
 *
 * Runs only on an explicit user action (the "Familie beitreten" button on
 * the invite confirmation screen) — never during a page render. A shared
 * invite link must not pull a signed-in visitor into a family unnoticed.
 *
 * @param token - The invite token from the URL.
 */
export async function acceptInvite(
  token: string,
): Promise<AcceptInviteResult> {
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return {
      success: false,
      reason: "invalid",
      error: "Die Einladung ist ungültig.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_family_invite", {
    p_token: token,
  });

  if (error) {
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }

  const status = (data as { status?: string } | null)?.status;
  switch (status) {
    case "joined":
      return { success: true };
    case "already_in_family":
      return {
        success: false,
        reason: "already_in_family",
        error: "Du bist schon in einer Familie.",
      };
    case "unauthenticated":
      return {
        success: false,
        error:
          "Deine Anmeldung ist abgelaufen. Bitte lade die Seite neu.",
      };
    default:
      return {
        success: false,
        reason: "invalid",
        error: "Diese Einladung ist nicht mehr gültig.",
      };
  }
}
