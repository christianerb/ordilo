"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { RefreshCw } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ARM_DISTANCE = 76;
const MAX_DISTANCE = 96;

export function PullToRefresh({
  children,
  onRefresh,
  className,
}: {
  children: ReactNode;
  onRefresh: () => Promise<unknown> | unknown;
  className?: string;
}) {
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const reset = useCallback(() => {
    startY.current = null;
    armed.current = false;
    setDistance(0);
  }, []);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (window.scrollY > 0 || refreshing) return;
    startY.current = event.touches[0]?.clientY ?? null;
  }, [refreshing]);

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? startY.current) - startY.current;
    if (delta <= 0) {
      reset();
      return;
    }

    const nextDistance = Math.min(MAX_DISTANCE, delta * 0.42);
    setDistance(nextDistance);

    if (nextDistance >= ARM_DISTANCE && !armed.current) {
      armed.current = true;
      haptic("selection");
    } else if (nextDistance < ARM_DISTANCE) {
      armed.current = false;
    }
  }, [reset]);

  const handleTouchEnd = useCallback(async () => {
    if (!armed.current || refreshing) {
      reset();
      return;
    }

    startY.current = null;
    armed.current = false;
    setRefreshing(true);
    setDistance(44);

    try {
      await onRefresh();
      haptic("success");
    } catch {
      haptic("warning");
    } finally {
      setRefreshing(false);
      setDistance(0);
    }
  }, [onRefresh, refreshing, reset]);

  const visible = distance > 0 || refreshing;

  return (
    <div
      className={cn("relative", className)}
      data-testid="pull-to-refresh"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => void handleTouchEnd()}
      onTouchCancel={reset}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-hidden transition-[height] duration-200",
          visible ? "h-14" : "h-0",
        )}
        aria-live="polite"
        aria-label={refreshing ? "Aktualisierung läuft" : undefined}
      >
        <div
          className="flex items-center gap-2 rounded-b-ordilo-sm border border-t-0 border-border bg-card px-3 text-xs font-medium text-[var(--petrol)] shadow-card"
          style={{
            transform: `translateY(${Math.min(0, distance - ARM_DISTANCE)}px)`,
          }}
        >
          <RefreshCw
            className={cn("size-3.5", refreshing && "animate-spin")}
            aria-hidden="true"
          />
          {refreshing
            ? "Aktualisiere …"
            : armed.current
              ? "Loslassen zum Aktualisieren"
              : "Zum Aktualisieren ziehen"}
        </div>
      </div>
      {children}
    </div>
  );
}
