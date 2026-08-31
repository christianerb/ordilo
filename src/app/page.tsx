import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/auth/routing";
import { LandingPage } from "./landing-page";

export const metadata: Metadata = {
  title: "Ordilo — Dokumente scannen, fragen, erledigt",
  description:
    "Die mobile Dokumenten-App für Familien: Briefe scannen, Ordilo fragen und wichtige Fristen automatisch im Blick behalten. Privat, verschlüsselt und auf Servern in der EU.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "https://ordilo.de",
    siteName: "Ordilo",
    title: "Ordilo — Scannen. Fragen. Erledigt.",
    description:
      "Die Dokumenten-App, die den Papierkram deiner Familie versteht.",
  },
  twitter: {
    card: "summary",
    title: "Ordilo — Scannen. Fragen. Erledigt.",
    description:
      "Die Dokumenten-App, die den Papierkram deiner Familie versteht.",
  },
};

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
