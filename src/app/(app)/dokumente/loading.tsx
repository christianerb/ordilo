/**
 * Loading skeleton for the Dokumente page.
 * Shown by Next.js App Router while the server component fetches the
 * document list. Mirrors the page header + document row layout so the
 * page doesn't shift on load.
 */
export default function DokumenteLoading() {
  return (
    <div className="space-y-4">
      {/* Page header skeleton: title + count on the left, action on the right */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="h-6 w-32 animate-pulse rounded bg-[var(--mist-light)]" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--mist-light)]" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-ordilo-sm bg-[var(--mist-light)]" />
      </div>

      {/* Document rows skeleton: icon square, title + timestamp, badge */}
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-ordilo-sm border border-border bg-card p-3"
          >
            <div className="size-10 shrink-0 animate-pulse rounded-ordilo-sm bg-[var(--sand-light)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--mist-light)]" />
              <div className="h-3 w-24 animate-pulse rounded bg-[var(--mist-light)]" />
            </div>
            <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-[var(--mist-light)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
