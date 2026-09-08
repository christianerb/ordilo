import { OrdiloMark } from "@/components/ordilo/ordilo-mark";

/**
 * Compact empty state for admin tables and feeds: the Ordilo mark on a
 * quiet sand circle plus one plain sentence. No CTA — the admin area
 * observes, it does not onboard.
 */
export function AdminEmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
        <OrdiloMark size={28} />
      </span>
      <p className="max-w-xs text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}
