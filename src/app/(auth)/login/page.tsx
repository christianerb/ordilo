import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/auth/routing";
import { LoginForm } from "./login-form";

/**
 * Login page.
 *
 * Server component: if the visitor is already authenticated, redirect them
 * to the appropriate post-auth destination (onboarding or /home). Otherwise
 * render the magic link login form.
 */
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { destination } = await getPostAuthDestination(supabase);
    redirect(destination);
  }

  return <LoginForm />;
}
