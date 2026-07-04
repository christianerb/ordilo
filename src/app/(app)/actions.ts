"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Logout server action.
 *
 * Signs the user out of Supabase (clearing the session and auth cookies),
 * then redirects to /login.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
