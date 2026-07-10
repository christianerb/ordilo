import { AppShell } from "@/components/ordilo/app-shell";

/**
 * Layout for authenticated app pages.
 *
 * Wraps all `(app)` routes in the Ordilo app shell. Collections, profile,
 * and other sidebar data are fetched client-side by AppShell itself (once
 * on mount), so this layout is a static pass-through that does NOT re-fetch
 * on every navigation — making route transitions fast.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
