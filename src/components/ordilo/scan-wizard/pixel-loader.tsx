import { cn } from "@/lib/utils";

const PIXELS = [
  90, 180, 270,
  0, 90, 180,
  270, 0, 90,
] as const;

/**
 * A compact, paper-like activity indicator for genuine background work.
 * It deliberately avoids a spinner: the small, staggered pixels read as
 * steady progress and remain still for people who reduce motion.
 */
export function PixelLoader({
  className,
  label = "Wird verarbeitet",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("grid grid-cols-3 gap-px", className)}
      data-testid="pixel-loader"
    >
      {PIXELS.map((delay, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="size-1 rounded-[1px] bg-[var(--petrol)] opacity-25 motion-safe:animate-processing-pixel"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
