"use client";

import Link from "next/link";
import { MessageCircle, ScanLine, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/hooks/use-mount-effect";
import { useState } from "react";

const FIRST_SUCCESS_GUIDE_STORAGE_KEY = "ordilo-first-success-guide-v1";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(FIRST_SUCCESS_GUIDE_STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

/**
 * A one-time, post-confirmation nudge. It celebrates the first real result
 * and offers the two most useful next actions without starting a tour.
 */
export function FirstSuccessGuide({ onScan }: { onScan: () => void }) {
  const [visible, setVisible] = useState(false);

  useMountEffect(() => {
    setVisible(!wasDismissed());
  });

  const dismiss = () => {
    try {
      window.localStorage.setItem(FIRST_SUCCESS_GUIDE_STORAGE_KEY, "dismissed");
    } catch {
      // The hint remains a convenience when storage is unavailable.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section
      className="relative overflow-hidden rounded-ordilo-md border border-[var(--mist-light)] bg-[var(--wash-sage)] p-4 shadow-card"
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
        className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-ordilo-sm text-muted-foreground transition-colors hover:bg-[var(--sand-warm)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
          className="h-11 flex-1 rounded-ordilo-md"
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
          className="h-11 flex-1 rounded-ordilo-md"
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
