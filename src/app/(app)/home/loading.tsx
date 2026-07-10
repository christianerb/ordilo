/**
 * Loading skeleton for the Home dashboard.
 * Shown by Next.js App Router while the server component fetches data.
 * Mirrors the bento layout of the home page so the layout doesn't shift.
 */
export default function HomeLoading() {
  return (
    <div className="space-y-4">
      {/* Search bar skeleton */}
      <div className="h-12 rounded-full border border-border bg-card px-3 py-2 shadow-card">
        <div className="flex items-center gap-2">
          <div className="size-5 animate-pulse rounded-full bg-[var(--mist-light)]" />
          <div className="h-4 w-48 animate-pulse rounded bg-[var(--mist-light)]" />
        </div>
      </div>

      {/* Bento top row: greeting tile + stat tile */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {/* Greeting tile skeleton */}
        <div className="col-span-2 lg:col-span-2 flex items-center justify-between rounded-ordilo-md bg-[var(--sand-warm)] p-4">
          <div className="space-y-1.5">
            <div className="h-4 w-28 animate-pulse rounded bg-[var(--mist-light)]" />
            <div className="h-3.5 w-20 animate-pulse rounded bg-[var(--mist-light)]" />
          </div>
          <div className="flex -space-x-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="size-8 animate-pulse rounded-full border-2 border-[var(--sand-warm)] bg-[var(--mist-light)]"
              />
            ))}
          </div>
        </div>
        {/* Stat tile skeleton */}
        <div className="col-span-1 flex flex-col justify-center gap-1.5 rounded-ordilo-md border border-[var(--petrol)]/15 bg-[var(--petrol)]/[0.06] p-4">
          <div className="size-4 animate-pulse rounded bg-[var(--mist-light)]" />
          <div className="h-7 w-8 animate-pulse rounded bg-[var(--mist-light)]" />
          <div className="h-3 w-20 animate-pulse rounded bg-[var(--mist-light)]" />
        </div>
      </div>

      {/* Section skeletons */}
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded bg-[var(--mist-light)]" />
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-ordilo-sm border border-border bg-card shadow-card"
            />
          ))}
        </div>
      </div>

      {/* Document bento grid skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-[var(--mist-light)]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-ordilo-sm border border-border bg-card shadow-card"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
