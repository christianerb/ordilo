/**
 * Loading skeleton for the Sammlungen page.
 * Shown by Next.js App Router while the server component fetches the
 * collections. Mirrors the page header + collection card grid so the
 * page doesn't shift on load.
 */
export default function SammlungenLoading() {
  return (
    <div className="space-y-4">
      {/* Page header skeleton: title + count on the left, action on the right */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="h-6 w-36 animate-pulse rounded bg-[var(--mist-light)]" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--mist-light)]" />
        </div>
        <div className="h-9 w-40 animate-pulse rounded-ordilo-sm bg-[var(--mist-light)]" />
      </div>

      {/* Collection cards skeleton: icon chip + name + count */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-ordilo-md border border-border bg-card p-4"
          >
            <div className="size-12 shrink-0 animate-pulse rounded-ordilo-md bg-[var(--sand-light)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-32 animate-pulse rounded bg-[var(--mist-light)]" />
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--mist-light)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
