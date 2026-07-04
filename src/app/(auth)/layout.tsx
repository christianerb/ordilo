/**
 * Layout for auth-related pages (login, magic link callback error).
 *
 * These pages intentionally do NOT render the app chrome (bottom tab
 * navigation) — they are shown to unauthenticated visitors.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
