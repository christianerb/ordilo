"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE } from "@/lib/invite";

/**
 * Server actions for the invite landing page (`/invite/[token]`).
 *
 * NOTE: "use server" modules may only export async functions — the
 * INVITE_COOKIE constant lives in `@/lib/invite`.
 */

type ActionResult =
  | { success: true }
  | { success: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send a magic-link sign-in email for an invited user.
 *
 * Stores the invite token in a short-lived cookie so the auth callback can
 * accept the invite right after the session is established — the invited
 * person clicks the email link and lands directly in the family, no extra
 * steps.
 *
 * @param email - The invitee's email address.
 * @param token - The invite token from the URL.
 * @param origin - The site origin (from the browser) for the redirect URL.
 */
export async function requestInviteSignIn(
  email: string,
  token: string,
  origin: string,
): Promise<ActionResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return {
      success: false,
      error: "Bitte gib eine gültige E-Mail-Adresse ein.",
    };
  }
  if (!/^[a-f0-9]{16,64}$/i.test(token)) {
    return { success: false, error: "Die Einladung ist ungültig." };
  }

  // Only same-site origins — the redirect target must stay on our domain.
  let redirectOrigin: string;
  try {
    const parsed = new URL(origin);
    redirectOrigin = parsed.origin;
  } catch {
    return { success: false, error: "Etwas ist schiefgelaufen. Bitte versuche es erneut." };
  }

  const cookieStore = await cookies();
  cookieStore.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectOrigin.startsWith("https"),
    path: "/",
    maxAge: 60 * 60, // 1 hour — enough for the email round trip
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      emailRedirectTo: `${redirectOrigin}/auth/callback`,
    },
  });

  if (error) {
    return {
      success: false,
      error: "E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.",
    };
  }

  return { success: true };
}
