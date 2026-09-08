/**
 * Route transition for the admin section — the same page fade-in the
 * authenticated app shell uses (see app/(app)/template.tsx). The template
 * remounts when entering /admin or switching to /admin/access; same-route
 * searchParam changes (tab, period, page) re-render the page without
 * replaying the fade.
 */
export default function AdminTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="animate-page-fade-in">{children}</div>;
}
