"use client";

import { useCallback, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  Loader2,
  MoveRight,
  Receipt,
  ScanLine,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/ordilo/auth-shell";
import { OrdiloMark } from "@/components/ordilo/ordilo-mark";
import { InviteJoinCelebration } from "@/components/ordilo/invite-join-celebration";
import { markWelcomeIntroSeen } from "./actions";

/**
 * The welcome flow for members who joined a family via invite.
 *
 * ONE welcome moment, then the product shown rather than described:
 *
 *   Step 0 (arrival): the celebration — the only screen that says
 *     "Willkommen". Both join paths land here (the invite page's accept
 *     click and the magic-link callback), so nobody is welcomed twice.
 *   Steps 1–3 (cards): what lives here, how documents get in, what you get
 *     back out — each with a small vignette built from real UI shapes, so
 *     the least technical person in the household SEES the product instead
 *     of parsing three sentences about it.
 *
 * Deliberately passive: nothing to fill in, every step leaves a way out
 * ("Direkt loslegen" / "Überspringen"). Cards can be swiped and their dots
 * are buttons — on a phone that is how people expect a card row to behave.
 *
 * The acknowledgement is written before leaving; a failed write is not
 * worth blocking on — worst case the intro shows once more.
 */

const CARD_COUNT = 3;
const SWIPE_THRESHOLD_PX = 48;

export function WelcomeIntro({ familyName }: { familyName: string | null }) {
  // 0 = arrival (celebration), 1–3 = the product cards.
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const isCard = step > 0;
  const isLastCard = step === CARD_COUNT;

  const leave = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    await markWelcomeIntroSeen();
    window.location.assign("/home");
  }, [leaving]);

  function goTo(next: number) {
    if (leaving) return;
    setStep(Math.min(Math.max(next, 0), CARD_COUNT));
  }

  function handleTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Horizontal intent only — a scroll must never flip the card.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
    goTo(step + (dx < 0 ? 1 : -1));
  }

  // ---------------------------------------------------------------------------
  // Arrival — the single welcome moment.
  // ---------------------------------------------------------------------------
  if (!isCard) {
    return (
      <AuthShell compact>
        <div
          className="space-y-6 text-center"
          data-testid="welcome-intro"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div data-testid="welcome-arrival" className="space-y-6">
            <div className="animate-card-in">
              <InviteJoinCelebration />
            </div>
            <div className="space-y-3 animate-card-in [animation-delay:120ms]">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                Willkommen in der Familie
              </h1>
              <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
                Du bist jetzt Teil von „{familyName ?? "eurer gemeinsamen Familie"}“.
                Alles Wichtige liegt ab jetzt gemeinsam an einem Ort.
              </p>
            </div>
            <div className="space-y-3 animate-card-in [animation-delay:180ms]">
              <Button
                type="button"
                size="lg"
                disabled={leaving}
                onClick={() => goTo(1)}
                className="h-12 w-full rounded-ordilo-md text-base press-scale"
                data-testid="welcome-start-button"
              >
                Kurz zeigen, wie&apos;s funktioniert
                <ArrowRight className="size-5" aria-hidden="true" />
              </Button>
              <button
                type="button"
                onClick={() => void leave()}
                disabled={leaving}
                className="w-full rounded-ordilo-sm py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default focus-ring"
                data-testid="welcome-direct-button"
              >
                {leaving ? "Einen Moment…" : "Direkt loslegen"}
              </button>
            </div>
          </div>
        </div>
      </AuthShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Cards — show, don't tell.
  // ---------------------------------------------------------------------------
  const cardIndex = step - 1;

  return (
    <AuthShell compact>
      <div
        className="space-y-5 text-center"
        data-testid="welcome-intro"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          So funktioniert Ordilo
        </p>

        <div
          key={step}
          className="animate-card-in space-y-4"
          role="group"
          aria-label={`Karte ${step} von ${CARD_COUNT}`}
          data-testid={`welcome-card-${cardIndex}`}
        >
          {step === 1 && (
            <>
              <CardFrame>
                <DocumentRow
                  icon={FileText}
                  title="Kfz-Versicherung"
                  chip="Vertrag"
                />
                <DocumentRow
                  icon={Receipt}
                  title="Stromabschlag"
                  chip="Rechnung"
                  delayMs={80}
                />
                <DocumentRow
                  icon={Stethoscope}
                  title="U9-Untersuchung"
                  chip="Arztbrief"
                  delayMs={160}
                />
              </CardFrame>
              <CardText title="Alles an einem Ort">
                Verträge, Rechnungen, Arztbriefe, Schulpost — gemeinsam an
                einem Ort statt verstreut in Schubladen und Postfächern.
              </CardText>
            </>
          )}

          {step === 2 && (
            <>
              <CardFrame>
                <div className="flex items-center justify-center gap-3">
                  <ScannedLetter />
                  <MoveRight
                    className="size-5 shrink-0 text-[var(--mist-dark)]"
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-col gap-2">
                    <RecognizedChip label="Frist: 31. März" delayMs={120} />
                    <RecognizedChip label="Betrag: 128,40 €" delayMs={220} />
                  </div>
                </div>
              </CardFrame>
              <CardText title="Abfotografieren reicht">
                Du hältst einfach drauf. Ordilo liest das Dokument, sortiert
                es ein und merkt sich Fristen und Beträge.
              </CardText>
            </>
          )}

          {step === 3 && (
            <>
              <CardFrame>
                <div className="flex flex-col gap-2.5">
                  <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--petrol)] px-3.5 py-2 text-left text-sm leading-snug text-[var(--warm-white)]">
                    Wann läuft die Kfz-Versicherung ab?
                  </p>
                  <div className="flex max-w-[85%] items-end gap-2 animate-card-in [animation-delay:140ms]">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
                      <OrdiloMark size={16} />
                    </span>
                    <div className="rounded-2xl rounded-bl-md border border-border bg-[var(--warm-white)] px-3.5 py-2 text-left">
                      <p className="text-sm leading-snug text-foreground">
                        Am 31. März 2027.
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--sand-light)] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <FileText className="size-3" aria-hidden="true" />
                        Kfz-Versicherung
                      </p>
                    </div>
                  </div>
                </div>
              </CardFrame>
              <CardText title="Einfach fragen">
                Frag in normalen Worten — Ordilo antwortet aus euren
                Dokumenten.
              </CardText>
            </>
          )}
        </div>

        <div
          className="flex items-center justify-center"
          role="group"
          aria-label="Karten wählen"
        >
          {Array.from({ length: CARD_COUNT }, (_, dot) => (
            <button
              key={dot}
              type="button"
              onClick={() => goTo(dot + 1)}
              aria-label={`Karte ${dot + 1} von ${CARD_COUNT}`}
              aria-current={dot === cardIndex ? "step" : undefined}
              data-testid={`welcome-dot-${dot}`}
              className="flex h-9 min-w-9 items-center justify-center rounded-full focus-ring"
            >
              <span aria-hidden="true" className="h-1.5 w-6 overflow-hidden rounded-full">
                <span
                  className={`block h-full w-full origin-left rounded-full transition-[background-color,transform] duration-200 [transition-timing-function:var(--ease-in-out)] motion-reduce:transition-none ${
                    dot === cardIndex
                      ? "scale-x-100 bg-[var(--petrol)]"
                      : "scale-x-25 bg-[var(--mist)]"
                  }`}
                />
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            size="lg"
            disabled={leaving}
            onClick={() => (isLastCard ? void leave() : goTo(step + 1))}
            className="h-12 w-full rounded-ordilo-md text-base press-scale"
            data-testid="welcome-next-button"
          >
            {leaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Einen Moment…
              </>
            ) : (
              <>
                {isLastCard ? "Los geht's" : "Weiter"}
                <ArrowRight className="size-5" aria-hidden="true" />
              </>
            )}
          </Button>
          {!isLastCard && (
            <button
              type="button"
              onClick={() => void leave()}
              disabled={leaving}
              className="w-full rounded-ordilo-sm py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default focus-ring"
              data-testid="welcome-skip-button"
            >
              Überspringen
            </button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------
// Vignette building blocks — real UI shapes, purely decorative.
// ---------------------------------------------------------------------------

/** Soft stage every vignette sits on. */
function CardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="space-y-2 rounded-ordilo-md border border-border bg-[var(--sand)] px-4 py-5"
    >
      {children}
    </div>
  );
}

function CardText({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h1>
      <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

/** One row of the mini document list (card 1). */
function DocumentRow({
  icon: Icon,
  title,
  chip,
  delayMs = 0,
}: {
  icon: typeof FileText;
  title: string;
  chip: string;
  delayMs?: number;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-ordilo-sm border border-border bg-[var(--warm-white)] px-3 py-2.5 text-left animate-card-in"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </span>
      <span className="shrink-0 rounded-full bg-[var(--sand-light)] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {chip}
      </span>
    </div>
  );
}

/** The little letter being scanned (card 2). */
function ScannedLetter() {
  return (
    <div className="relative h-28 w-[5.5rem] shrink-0 overflow-hidden rounded-lg border border-border bg-[var(--warm-white)] p-2.5 shadow-card">
      <div className="space-y-1.5">
        <div className="h-1.5 w-10 rounded-full bg-[var(--mist-light)]" />
        <div className="h-1.5 w-14 rounded-full bg-[var(--sand-warm)]" />
        <div className="h-1.5 w-12 rounded-full bg-[var(--sand-warm)]" />
        <div className="h-1.5 w-14 rounded-full bg-[var(--sand-warm)]" />
        <div className="h-1.5 w-9 rounded-full bg-[var(--sand-warm)]" />
        <div className="h-1.5 w-11 rounded-full bg-[var(--sand-warm)]" />
      </div>
      {/* The scan line — static on purpose: it reads as "scan" without
          needing motion, so reduced-motion users lose nothing. */}
      <div className="absolute inset-x-1 top-1/2 h-0.5 rounded-full bg-[var(--apricot)]" />
      <ScanLine
        className="absolute bottom-1.5 right-1.5 size-4 text-[var(--petrol)]"
        strokeWidth={1.75}
      />
    </div>
  );
}

/** A recognized fact chip (card 2). */
function RecognizedChip({ label, delayMs = 0 }: { label: string; delayMs?: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-[var(--warm-white)] py-1 pl-1.5 pr-3 text-xs font-medium text-foreground animate-card-in"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="flex size-4 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
        <Check className="size-3" strokeWidth={2.5} />
      </span>
      {label}
    </span>
  );
}
