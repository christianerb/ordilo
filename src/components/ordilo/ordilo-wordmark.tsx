import { OrdiloMascot } from "@/components/ordilo/mascot";
import { cn } from "@/lib/utils";

interface OrdiloWordmarkProps {
  mascotSize?: number;
  className?: string;
  labelClassName?: string;
}

/**
 * The product mark is a small, authored hello from Ordilo. It is deliberately
 * reserved for brand moments (navigation and entry surfaces), not used as a
 * generic animated icon throughout the app.
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
      <span className="ordilo-wordmark__sparkles" aria-hidden="true">
        <i className="ordilo-wordmark__sparkle ordilo-wordmark__sparkle--one" />
        <i className="ordilo-wordmark__sparkle ordilo-wordmark__sparkle--two" />
        <i className="ordilo-wordmark__sparkle ordilo-wordmark__sparkle--three" />
      </span>
    </span>
  );
}
