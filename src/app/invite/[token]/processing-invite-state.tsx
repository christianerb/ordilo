"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { AuthShell } from "@/components/ordilo/auth-shell";
import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";

/**
 * Short-lived wait state for documents that are still in the pipeline.
 * It owns its timer so it remounts cleanly whenever the invite flow enters
 * this state, including after a stale merge preview.
 */
export function ProcessingInviteState() {
  const [seconds, setSeconds] = useState(15);

  useMountEffect(() => {
    const countdown = window.setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    const refresh = window.setTimeout(() => window.location.reload(), 15_000);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(refresh);
    };
  });

  return (
    <AuthShell compact>
      <div className="space-y-6 text-center" data-testid="invite-source-processing">
        <div className="flex justify-center animate-card-in">
          <div className="flex size-16 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
            <Loader2 className="size-7 animate-spin" strokeWidth={1.75} aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-3 animate-card-in [animation-delay:40ms]">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Fast fertig
          </h1>
          <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
            Einige deiner Dokumente werden noch vorbereitet. Danach kannst du
            deine Familie sicher zusammenführen.
          </p>
          <p className="text-sm text-muted-foreground">
            Wir prüfen automatisch in {seconds} Sekunden erneut.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={() => window.location.reload()}
          className="h-12 w-full rounded-ordilo-md text-base press-scale animate-card-in [animation-delay:80ms]"
        >
          Jetzt nochmal prüfen
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
        <Button
          asChild
          variant="outline"
          size="lg"
          className="h-12 w-full rounded-ordilo-md text-base press-scale"
        >
          <Link href="/home">Zu meiner Familie</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
