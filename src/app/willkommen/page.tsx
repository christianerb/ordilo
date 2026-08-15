import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  needsWelcomeIntro,
  resolveUserFamily,
} from "@/lib/supabase/resolve-user-family";
import { WelcomeIntro } from "./welcome-intro";

/**
 * Welcome intro — `/willkommen`.
 *
 * Shown once to members who joined a family through an invite. The family
 * creator walked through setup and learned the product on the way; an
 * invitee follows a link from their partner and would otherwise land in a
 * document list with no idea what Ordilo is.
 *
 * The middleware routes both join paths here (the invite page's own redirect
 * and the magic-link callback) and sends anyone else on to /home. This page
 * re-checks rather than trusting that: a direct URL visit, a stale tab or an
 * RSC refresh all reach it without passing the middleware's GET-only gate.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data: family, error } = await resolveUserFamily(supabase);

  // On a query error, send the user into the app rather than stranding them
  // on an intro we cannot verify — /home renders its own error states.
  if (error || !needsWelcomeIntro(family)) {
    redirect("/home");
  }

  return <WelcomeIntro familyName={family?.name ?? null} />;
}
