import type { Metadata } from "next";
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
 * Rendered statically so visitors and crawlers get the landing page from
 * the CDN. Signed-in users never see it: the middleware redirects them to
 * /home (and from there to onboarding when needed) before this renders.
 */
export default function HomePage() {
  return <LandingPage />;
}
