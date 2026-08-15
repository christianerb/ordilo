"use client";

import { useCallback, useState } from "react";
import {
  ArrowRight,
  FolderHeart,
  Loader2,
  ScanLine,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/ordilo/auth-shell";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { markWelcomeIntroSeen } from "./actions";

type IntroCard = {
  icon: LucideIcon;
  title: string;
  body: string;
};

/**
 * Three cards, in the order someone actually meets Ordilo: what is kept
 * here, how things get in, what you get back out.
 */
const CARDS: IntroCard[] = [
  {
    icon: FolderHeart,
    title: "Alles an einem Ort",
    body:
      "Verträge, Rechnungen, Arztbriefe, Schulpost — die Unterlagen eurer "
      + "Familie liegen ab jetzt gemeinsam hier statt verteilt in Schubladen "
      + "und Postfächern.",
  },
  {
    icon: ScanLine,
    title: "Abfotografieren reicht",
    body:
      "Du hältst drauf, den Rest macht Ordilo: Er liest das Dokument, "
      + "sortiert es ein und merkt sich Fristen und Beträge.",
  },
  {
    icon: Sparkles,
    title: "Einfach fragen",
    body:
      "„Wann läuft die Kfz-Versicherung ab?“ — frag in normalen Worten, "
      + "statt Ordner zu durchsuchen. Ordilo antwortet aus euren Dokumenten.",
  },
];

/**
 * The welcome intro for members who joined a family via invite.
 *
 * Deliberately passive: three cards, nothing to fill in, and "Überspringen"
 * on every one of them. Somebody who was handed a link by their partner
 * should learn what this app is — not be handed setup work that the person
 * who created the family already did.
 *
 * The acknowledgement is written before leaving, so the intro never returns
 * on the next device. A failed write is not worth blocking on: the user is
 * moved into the app either way and would simply see the intro once more.
 */
export function WelcomeIntro({ familyName }: { familyName: string | null }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const card = CARDS[index];
  const isLast = index === CARDS.length - 1;

  const leave = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    await markWelcomeIntroSeen();
    window.location.assign("/home");
  }, [leaving]);

  return (
    <AuthShell compact>
      <div className="space-y-6 text-center" data-testid="welcome-intro">
        <div className="flex justify-center animate-card-in">
          <OrdiloMascot
            size={72}
            mood="success"
            style={{ color: "var(--petrol)" }}
          />
        </div>

        <div className="space-y-3 animate-card-in [animation-delay:40ms]">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
            {index === 0 && familyName
              ? `Willkommen bei „${familyName}“`
              : "Willkommen bei Ordilo"}
          </h1>
          <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
            Kurz erklärt, was Ordilo für euch tut. Dauert keine Minute.
          </p>
        </div>

        <div
          key={index}
          className="animate-card-in space-y-3 rounded-ordilo-md border border-border bg-[var(--sand)] px-4 py-5 text-left"
          data-testid={`welcome-card-${index}`}
        >
          <div className="flex size-11 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
            <card.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            {card.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {card.body}
          </p>
        </div>

        <div
          className="flex items-center justify-center gap-2"
          role="group"
          aria-label={`Karte ${index + 1} von ${CARDS.length}`}
        >
          {CARDS.map((entry, dot) => (
            <span
              key={entry.title}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all duration-200 ${
                dot === index
                  ? "w-6 bg-[var(--petrol)]"
                  : "w-1.5 bg-[var(--mist-light)]"
              }`}
            />
          ))}
        </div>

        <div className="space-y-3 animate-card-in [animation-delay:120ms]">
          <Button
            type="button"
            size="lg"
            disabled={leaving}
            onClick={() => (isLast ? void leave() : setIndex(index + 1))}
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
                {isLast ? "Los geht's" : "Weiter"}
                <ArrowRight className="size-5" aria-hidden="true" />
              </>
            )}
          </Button>
          {!isLast && (
            <button
              type="button"
              onClick={() => void leave()}
              disabled={leaving}
              className="w-full rounded-ordilo-sm py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
