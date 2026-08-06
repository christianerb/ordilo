/**
 * Route transition for the authenticated app shell.
 *
 * Unlike `layout.tsx` (which persists across navigations by design — see
 * its own doc comment), a `template.tsx` remounts on every route change,
 * which is exactly what's needed to replay the fade-in on each page swap
 * (bottom-nav tabs, /familie/[id], …) while AppShell itself stays mounted.
 *
 * `.animate-page-fade-in` already existed in globals.css (with a
 * prefers-reduced-motion override) but nothing rendered it — this wires it
 * up for real cross-route transitions instead of a hard cut.
 */
export default function AppTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="animate-page-fade-in">{children}</div>;
}
