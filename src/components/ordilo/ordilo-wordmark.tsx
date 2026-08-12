import { OrdiloMascot } from "@/components/ordilo/mascot";
import { cn } from "@/lib/utils";

interface OrdiloWordmarkProps {
  mascotSize?: number;
  className?: string;
  labelClassName?: string;
}

/**
 * The product mark is a quiet, static composition (halo, mascot, name) for
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
      <span className="ordilo-wordmark__mascot" aria-hidden="true">
        <OrdiloMascot
          size={mascotSize}
          mood="greeting"
          animate={false}
          style={{ color: "var(--petrol)" }}
        />
      </span>
      <span className={cn("ordilo-wordmark__label", labelClassName)}>
        Ordilo
      </span>
    </span>
  );
}
