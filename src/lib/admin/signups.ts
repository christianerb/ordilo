import type { User } from "@supabase/supabase-js";

/**
 * When an auth user became a real signup. Requesting a login code already
 * creates the auth user; only confirming the code makes it an account, and
 * every admin number about signups starts its clock there. Null for codes
 * that were never confirmed.
 */
export function signupConfirmedAt(user: Pick<User, "email_confirmed_at">): string | null {
  return user.email_confirmed_at ?? null;
}
