"use client";

import { AudioLines, Crown, PhoneOff } from "lucide-react";

import { OrdiloMark } from "@/components/ordilo/ordilo-mark";
import { useChangeEffect } from "@/lib/hooks/use-change-effect";
import { useLiveConversation } from "@/lib/realtime/use-live-conversation";
import { cn } from "@/lib/utils";

const STATUS_COPY = {
  idle: "",
  connecting: "Ordilo verbindet sich …",
  listening: "Ordilo hört zu",
  thinking: "Ordilo schaut nach …",
  speaking: "Ordilo antwortet",
  ending: "Ordilo beendet das Gespräch …",
} as const;

export function LiveConversationPanel({
  familyId,
  premium,
  onTurn,
  onError,
  onActiveChange,
  disabled = false,
}: {
  familyId: string;
  premium: boolean;
  onTurn: (transcript: string) => Promise<string | null>;
  onError: (message: string) => void;
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const live = useLiveConversation({ familyId, onTurn, onError });
  const active = live.status !== "idle";
  useChangeEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  return (
    <div className="flex items-center gap-2">
      {active ? (
        <div
          className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--petrol)]/20 bg-[var(--wash-sage-soft)] py-1 pl-2 pr-1"
          aria-live="polite"
        >
          <OrdiloMark size={24} animate={live.status === "speaking"} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[var(--petrol)]">
              {STATUS_COPY[live.status]}
            </p>
            {live.lastTranscript ? (
              <p className="max-w-44 truncate text-xs text-muted-foreground">
                „{live.lastTranscript}“
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={live.stop}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--petrol)] text-white focus-ring"
            aria-label="Live-Gespräch beenden"
          >
            <PhoneOff className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            onActiveChange?.(true);
            void live.start();
          }}
          disabled={disabled}
          className={cn(
            "flex min-h-9 items-center gap-1.5 rounded-ordilo-sm px-2.5 text-xs font-medium transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50",
            premium
              ? "bg-[var(--wash-sage-soft)] text-[var(--petrol)] hover:bg-[var(--sand-warm)]"
              : "border border-border bg-card text-muted-foreground hover:bg-[var(--sand-warm)]",
          )}
          aria-label={
            premium
              ? "Live mit Ordilo sprechen"
              : "Live mit Ordilo, Premium-Feature"
          }
        >
          <AudioLines className="size-4" aria-hidden="true" />
          <span>Live</span>
          {!premium ? <Crown className="size-3.5" aria-hidden="true" /> : null}
        </button>
      )}
    </div>
  );
}
