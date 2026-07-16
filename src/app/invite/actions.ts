"use server";

import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
  });

  if (error) {
    return {
      success: false,
      error: "E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.",
    };
  }

  return { success: true };
}
