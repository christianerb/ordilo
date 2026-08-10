/**
 * Loading skeleton for the Suche page.
 * Shown by Next.js App Router while the server component loads. Mirrors
 * the search input + result list layout so the page doesn't shift on
 * load.
 */
export default function SucheLoading() {
  return (
    <div className="space-y-4">
      {/* Search input skeleton */}
      <div className="h-11 w-full animate-pulse rounded-ordilo-sm border border-border bg-card" />

      {/* Result rows skeleton: icon square, title + snippet */}
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-ordilo-sm border border-border bg-card p-3"
          >
            <div className="size-10 shrink-0 animate-pulse rounded-ordilo-sm bg-[var(--sand-light)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-36 animate-pulse rounded bg-[var(--mist-light)]" />
              <div className="h-3 w-full max-w-xs animate-pulse rounded bg-[var(--mist-light)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
