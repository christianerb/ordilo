import { OrdiloMark } from "@/components/ordilo/ordilo-mark";
import { cn } from "@/lib/utils";

interface OrdiloWordmarkProps {
  mascotSize?: number;
  className?: string;
  labelClassName?: string;
}

/**
 * The product mark is a quiet, static composition (halo, mark, name) for
 * navigation and entry surfaces. Per DESIGN.md it carries no decorative
 * motion — the only response is a subtle 240ms hover state transition.
 */
export function OrdiloWordmark({
  mascotSize = 28,
  className,
  labelClassName,
}: OrdiloWordmarkProps) {
  return (
    <span className={cn("ordilo-wordmark", className)}>
      <span className="ordilo-wordmark__mark" aria-hidden="true">
        <OrdiloMark
          size={mascotSize}
          animate={false}
          className="text-[var(--petrol)]"
        />
      </span>
      <span className={cn("ordilo-wordmark__label", labelClassName)}>
        Ordilo
      </span>
    </span>
  );
}
