/**
 * Loading skeleton for the Aufgaben page.
 * Shown by Next.js App Router while the server component fetches the
 * task list. Mirrors the page header + task row layout so the page
 * doesn't shift on load.
 */
export default function AufgabenLoading() {
  return (
    <div className="space-y-4">
      {/* Page header skeleton: title + count on the left */}
      <div className="space-y-1.5">
        <div className="h-6 w-28 animate-pulse rounded bg-[var(--mist-light)]" />
        <div className="h-3.5 w-20 animate-pulse rounded bg-[var(--mist-light)]" />
      </div>

      {/* Task rows skeleton: round checkbox, title + due date, badge */}
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-ordilo-sm border border-border bg-card p-3"
          >
            <div className="size-6 shrink-0 animate-pulse rounded-full bg-[var(--mist-light)]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-44 animate-pulse rounded bg-[var(--mist-light)]" />
              <div className="h-3 w-28 animate-pulse rounded bg-[var(--mist-light)]" />
            </div>
            <div className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-[var(--mist-light)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
