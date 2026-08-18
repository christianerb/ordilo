"use client";

import { useRef, useState } from "react";
import { useChangeEffect } from "@/lib/hooks/use-change-effect";

/**
 * A brief counter transition for values that changed because the family
 * acted, never a dashboard-style count-up on every page load.
 */
export function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useChangeEffect(() => {
    const from = previousValue.current;
    previousValue.current = value;
    if (from === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(value);
      return;
    }

    const startedAt = performance.now();
    const duration = 240;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 4;
      setDisplayValue(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="animate-count-up tabular-nums">{displayValue}</span>;
}
