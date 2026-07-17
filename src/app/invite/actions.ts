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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!/^[a-f0-9]{16,64}$/i.test(token)) {
    return { success: false, error: "Die Einladung ist ungültig." };
  }

  const requestHeaders = await headers();
  const host = (
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  )?.split(",")[0]?.trim();
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host?.startsWith("localhost") ? "http" : "https");

  if (!host || (protocol !== "http" && protocol !== "https")) {
    return {
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: protocol === "https",
    path: "/",
    maxAge: 60 * 60,
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      emailRedirectTo: `${protocol}://${host}/auth/callback`,
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
