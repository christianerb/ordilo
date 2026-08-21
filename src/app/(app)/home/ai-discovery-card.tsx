"use client";

import { ChevronRight } from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import type { DiscoveryInsight } from "@/lib/home-insights";

/**
 * "Ordilo hat etwas entdeckt" — one proactive nudge, styled like the
 * inbound-email discovery card (InboundDiscovery): a sand-toned surface
 * with the mascot present, not a status banner. Renders nothing when
 * there is no insight — silence is a feature, the same rule the daily
 * digest email already follows.
 */
export function AiDiscoveryCard({
  insight,
  onView,
}: {
  insight: DiscoveryInsight | null;
  onView: (documentId: string) => void;
}) {
  if (!insight) return null;

  return (
    <section
      data-testid="home-ai-discovery"
      className="relative overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--surface-story)] px-4 py-3.5 shadow-card"
    >
      <div
        className="pointer-events-none absolute -bottom-10 -left-8 size-32 rounded-full bg-[var(--wash-sage)]/60"
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-3">
        <OrdiloMascot
          mood="helping"
          size={44}
          style={{ color: "var(--petrol)" }}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Ordilo hat etwas entdeckt
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {insight.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onView(insight.documentId)}
          data-testid="home-ai-discovery-view"
          className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-[var(--petrol)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-ring"
        >
          Ansehen
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
