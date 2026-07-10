/**
 * Loading state for the (app) route group.
 *
 * Shown instantly by Next.js while server components (home, familie, suche,
 * etc.) fetch data. The skeleton matches the app shell's content area so
 * navigation feels immediate — the old page is replaced by this skeleton,
 * then the new page streams in.
 */
export default function Loading() {
  return (
    <div className="space-y-4 px-4 py-4 md:px-6 lg:px-8">
      {/* Skeleton header */}
      <div className="h-7 w-48 animate-pulse rounded-ordilo-sm bg-[var(--sand-warm)]" />

      {/* Skeleton cards */}
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-ordilo-sm bg-[var(--sand)]" />
        <div className="h-20 animate-pulse rounded-ordilo-sm bg-[var(--sand)]" />
        <div className="h-20 animate-pulse rounded-ordilo-sm bg-[var(--sand)]" />
      </div>
    </div>
  );
}
