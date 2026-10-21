import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/auth/routing";
import { LandingPage } from "./landing-page";
import { publicMetadata } from "@/lib/marketing";

export const metadata: Metadata = publicMetadata(
  "Dokumenten-App für Familien: scannen & fragen | Ordilo",
  "Briefe scannen, Dokumente gemeinsam ablegen und Antworten mit Fundstelle finden. Für iPhone und Web: Scannen und Fragen kostenlos, Live-Gespräch optional.",
  "/",
);

/**
 * Root page.
 *
 * Authenticated users are redirected to their post-auth destination
 * (onboarding or /home). Unauthenticated visitors get the landing page —
 * the public face of the product, with its CTA leading to /login.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { destination } = await getPostAuthDestination(supabase);
    redirect(destination);
  }

  return <LandingPage />;
}
