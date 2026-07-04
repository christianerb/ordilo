import { AppShell } from "@/components/ordilo/app-shell";

/**
 * Layout for authenticated app pages.
 *
 * Wraps all `(app)` routes in the Ordilo app shell, which provides a minimal
 * top bar with a logout affordance, a centered mobile-first content column,
 * and a fixed bottom tab navigation (Home, Scan, Suche, Familie, Aufgaben)
 * with a dark petrol background. The bottom nav is hidden on `/onboarding`.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
