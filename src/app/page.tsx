import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostAuthDestination } from "@/lib/auth/routing";
import { LandingPage } from "./landing-page";

export const metadata: Metadata = {
  title: "Ordilo — Einmal scannen. Nie wieder suchen.",
  description:
    "Ordilo liest eure Briefe, Rechnungen und Verträge, sortiert sie von selbst ein und beantwortet eure Fragen. Server in der EU, verschlüsselt, ohne Werbung. Kostenlos starten.",
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
