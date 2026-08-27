"use client";

import Link from "next/link";
import { MessageCircle, ScanLine, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const FIRST_SUCCESS_GUIDE_STORAGE_KEY = "ordilo-first-success-guide-v1";

function storageKey(familyId: string): string {
  return `${FIRST_SUCCESS_GUIDE_STORAGE_KEY}:${familyId}`;
}

function wasDismissed(familyId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(familyId)) === "dismissed";
  } catch {
    return false;
  }
}

/**
 * A one-time, post-confirmation nudge. It celebrates the first real result
 * and offers the two most useful next actions without starting a tour.
 */
export function FirstSuccessGuide({
  familyId,
  onScan,
}: {
  familyId: string;
  onScan: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"entering" | "visible" | "leaving">(
    "entering",
  );
  const frameRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const dismissingRef = useRef(false);

  useMountEffect(() => {
    if (wasDismissed(familyId)) return;
    setMounted(true);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setPhase("visible");
    });

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  });

  const dismiss = () => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setPhase("leaving");
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      try {
        window.localStorage.setItem(storageKey(familyId), "dismissed");
      } catch {
        // The hint remains a convenience when storage is unavailable.
      }
      setMounted(false);
    }, 150);
  };

  if (!mounted) return null;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-ordilo-md border border-[var(--mist-light)] bg-[var(--wash-sage)] p-4 shadow-card transition-[opacity,transform] [transition-timing-function:var(--ease-out)] motion-reduce:transform-none motion-reduce:transition-opacity motion-reduce:duration-150",
        phase === "leaving" ? "duration-150" : "duration-[220ms]",
        phase === "entering" && "translate-y-2 scale-[0.98] opacity-0",
        phase === "visible" && "translate-y-0 scale-100 opacity-100",
        phase === "leaving" && "-translate-y-1 scale-100 opacity-0",
      )}
      data-state={phase}
      data-testid="first-success-guide"
      aria-labelledby="first-success-guide-title"
    >
      <div
        className="pointer-events-none absolute -right-5 -top-7 size-24 rounded-full bg-[var(--petrol)]/[0.06]"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-ring"
        aria-label="Hinweis schließen"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div className="relative flex gap-3 pr-7">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/10 text-[var(--petrol)]"
          aria-hidden="true"
        >
          <Sparkles className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2
            id="first-success-guide-title"
            className="text-base font-semibold text-foreground"
          >
            Dein Familienbuch wächst
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Ordilo merkt sich jetzt, was wichtig ist. Du kannst weiter sammeln
            oder einfach eine Frage stellen.
          </p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="lg"
          onClick={onScan}
          className="h-12 flex-1 rounded-ordilo-md"
          data-testid="first-success-scan"
        >
          <ScanLine className="size-4" aria-hidden="true" />
          Nächstes Dokument scannen
        </Button>
        <Button
          asChild
          type="button"
          size="lg"
          variant="outline"
          className="h-12 flex-1 rounded-ordilo-md"
        >
          <Link href="/suche">
            <MessageCircle className="size-4" aria-hidden="true" />
            Etwas fragen
          </Link>
        </Button>
      </div>
    </section>
  );
}
