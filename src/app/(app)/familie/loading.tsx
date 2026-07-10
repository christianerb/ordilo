/**
 * Loading skeleton for the Familie page.
 * Shown by Next.js App Router while the server component fetches the
 * family, its members, and per-member document counts. Mirrors the family
 * banner + member list layout so the page doesn't shift on load.
 */
export default function FamilieLoading() {
  return (
    <div className="space-y-4">
      {/* Family banner skeleton */}
      <div className="flex items-center gap-3 rounded-ordilo-md border border-border p-4">
        <div className="flex -space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="size-9 animate-pulse rounded-full border-2 border-[var(--sand-light)] bg-[var(--mist-light)]"
            />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-16 animate-pulse rounded bg-[var(--mist-light)]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--mist-light)]" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--mist-light)]" />
        </div>
      </div>

      {/* Member list skeleton */}
      <div className="divide-y divide-border rounded-ordilo-sm border border-border bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-[var(--mist-light)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--mist-light)]" />
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--mist-light)]" />
            </div>
          </div>
        ))}
      </div>

      {/* Add-member button skeleton */}
      <div className="h-11 w-full animate-pulse rounded-ordilo-sm border border-dashed border-border" />
    </div>
  );
}
