import Link from "next/link";
import {
  ScanLine,
  MessageCircleQuestion,
  BellRing,
  Users,
  Lock,
  Check,
  Camera,
  Sparkles,
  ArrowRight,
  Hash,
  CalendarClock,
} from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";

/**
 * Landing page — what an unauthenticated visitor sees on `/`.
 *
 * One promise, told three ways: scan it once, find it forever, miss
 * nothing. Pure server-rendered marketing content (no client JS beyond
 * the mascot's CSS animations), warm palette per DESIGN.md, one CTA
 * ("Kostenlos starten" → /login) repeated at top and bottom.
 *
 * The product mock is built from real design tokens instead of a
 * screenshot, so it never goes stale and weighs nothing.
 */
export function LandingPage() {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-[var(--auth-background)] text-foreground">
      <div className="pointer-events-none fixed -left-24 top-48 size-72 rounded-full bg-[var(--auth-blue-wash)]" aria-hidden="true" />
      <div className="pointer-events-none fixed -right-24 -top-24 h-80 w-96 rotate-12 rounded-[28px] bg-[var(--auth-sage-wash)]" aria-hidden="true" />
      <div className="pointer-events-none fixed -bottom-40 left-[8%] h-72 w-[30rem] -rotate-6 rounded-[28px] bg-[var(--auth-apricot-wash)]" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-8 lg:space-y-6 lg:px-10">
        <section className="overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--auth-surface)] shadow-card">
          <header className="flex items-center justify-between px-6 py-5 sm:px-9 lg:px-12">
            <div className="flex items-center gap-2.5">
              <OrdiloMascot size={30} mood="idle" style={{ color: "var(--petrol)" }} />
              <span className="text-xl font-semibold tracking-[-0.03em] text-[var(--petrol-darker)]">
                ordil<span className="text-[var(--apricot)]">o</span>
              </span>
            </div>
            <Link
              href="/login"
              className="rounded-ordilo-sm px-3 py-2 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--auth-sage)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Anmelden
            </Link>
          </header>

          <div className="grid lg:grid-cols-[1.02fr_0.98fr]">
            <div className="flex flex-col justify-center bg-[var(--auth-story-surface)] px-6 py-10 sm:px-10 sm:py-14 lg:min-h-[540px] lg:px-12">
              <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--auth-sage)] px-3 py-1.5 text-xs font-medium text-[var(--petrol-darker)]">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Das Familiengedächtnis für euren Papierkram
              </p>
              <h1 className="mt-5 text-3xl font-semibold leading-[1.12] tracking-[-0.035em] sm:text-4xl lg:text-[2.75rem]">
                Einmal scannen.
                <br />
                Nie wieder suchen.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
                Ordilo liest eure Briefe, Rechnungen und Verträge, sortiert sie
                von selbst ein und merkt sich jedes wichtige Detail. Ihr fragt
                einfach.
              </p>
              <div className="mt-5 flex flex-wrap gap-2" aria-label="Ordilo Vorteile">
                {["Dokumente scannen", "Antworten finden", "Fristen merken"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5 rounded-ordilo-sm bg-white/75 px-2.5 py-2 text-xs font-medium text-[var(--mist-dark)]">
                    <Check className="size-3.5 text-[var(--petrol)]" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-ordilo-sm bg-[var(--petrol)] px-6 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="landing-cta-hero"
                >
                  Kostenlos starten
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <p className="text-xs text-muted-foreground">
                  Ohne Passwort und Kreditkarte.
                </p>
              </div>
            </div>

            <div className="relative flex min-h-[430px] items-center justify-center overflow-hidden bg-[var(--auth-illustration)] px-6 py-10 sm:px-10 lg:min-h-[540px]">
              <div className="absolute -left-16 bottom-10 size-48 rounded-full bg-[var(--auth-sage)]" aria-hidden="true" />
              <div className="absolute -right-16 top-12 h-52 w-60 rotate-6 rounded-[28px] bg-[var(--auth-blue-wash)]" aria-hidden="true" />
              <div className="relative w-full max-w-sm space-y-3">
                <div className="mr-7 rounded-ordilo-sm bg-[var(--auth-surface)] p-4 shadow-card">
                  <p className="text-xs font-medium text-muted-foreground">Du fragst</p>
                  <p className="mt-1.5 text-sm font-medium">
                    Wie ist die Seriennummer der Waschmaschine?
                  </p>
                </div>
                <div className="ml-7 rounded-ordilo-sm bg-[var(--auth-surface)] p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
                      <OrdiloMascot size={25} mood="helping" animate={false} />
                    </span>
                    <p className="text-xs font-medium text-[var(--petrol)]">Ordilo antwortet</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2.5 rounded-ordilo-sm bg-[var(--sand-light)] px-3 py-2.5">
                    <Hash className="size-4 shrink-0 text-[var(--mist-dark)]" aria-hidden="true" />
                    <span className="text-sm font-semibold tabular-nums">WM-482-A93816</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Aus: Rechnung Waschmaschine · Juli 2024
                  </p>
                </div>
                <div className="mx-3 flex items-center gap-2.5 rounded-ordilo-sm bg-[var(--auth-surface)] px-4 py-3 shadow-card">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--auth-sage)]">
                    <CalendarClock className="size-4 text-[var(--petrol)]" aria-hidden="true" />
                  </span>
                  <p className="text-sm">
                    <span className="font-medium">Erinnerung:</span>{" "}
                    <span className="text-muted-foreground">Garantie läuft in 30 Tagen ab</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--auth-surface)] shadow-card">
          <div className="grid md:grid-cols-3">
            <ValueProp icon={ScanLine} title="Scannen & vergessen" text="Kamera draufhalten, fertig. Ordilo erkennt, was es ist, für wen es ist und sortiert es selbst ein." />
            <ValueProp icon={MessageCircleQuestion} title="Einfach fragen" text="Ordilo findet die Antwort in euren Dokumenten — nicht nur das richtige Dokument." />
            <ValueProp icon={BellRing} title="Nichts mehr verpassen" text="Fristen, Zahlungen und Garantien werden erkannt, bevor etwas wichtig oder teuer wird." />
          </div>
        </section>

        <section className="grid overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--auth-surface)] shadow-card lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col justify-between bg-[var(--petrol-darker)] p-7 text-[var(--warm-white)] sm:p-10">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">So funktioniert&apos;s</h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
                Aus einem Foto wird ein Familiengedächtnis. Den Rest erledigt Ordilo im Hintergrund.
              </p>
            </div>
            <OrdiloMascot size={54} mood="greeting" className="mt-8 text-[var(--auth-sage)]" />
          </div>
          <div className="divide-y divide-border px-6 sm:px-9">
            <HowStep step="1" icon={Camera} title="Scannen" text="Dokument mit dem Handy abfotografieren — auch mehrseitig, auch als PDF." />
            <HowStep step="2" icon={Sparkles} title="Ordilo sortiert" text="Personen, Beträge, Fristen und Nummern werden erkannt und automatisch abgelegt." />
            <HowStep step="3" icon={MessageCircleQuestion} title="Einfach fragen" text="Per Text oder Stimme — Ordilo antwortet mit dem Inhalt, nicht mit einem Suchtreffer." />
          </div>
        </section>

        <section className="grid overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--auth-surface)] shadow-card md:grid-cols-2">
          <div className="bg-[var(--auth-sage)]/60 p-7 sm:p-10">
            <span className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--auth-surface)] text-[var(--petrol)]">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em]">Für die ganze Familie</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Ein gemeinsames Familienbuch statt fünf Ablagesysteme. Jeder scannt, alle finden.
            </p>
          </div>
          <div className="bg-[var(--auth-story-surface)] p-7 sm:p-10">
            <span className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--auth-surface)] text-[var(--petrol)]">
              <Lock className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em]">Eure Dokumente gehören euch</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Private Ablage, nur für eure Familie. Keine Werbung und kein Verkauf eurer Daten.
            </p>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-ordilo-md border border-white/80 bg-[var(--auth-surface)] px-6 py-12 text-center shadow-card sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute -left-16 -top-20 size-52 rounded-full bg-[var(--auth-blue-wash)]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 -right-10 size-52 rounded-full bg-[var(--auth-apricot-wash)]" aria-hidden="true" />
          <div className="relative">
            <OrdiloMascot size={56} mood="greeting" className="mx-auto text-[var(--petrol)]" />
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Weniger Papierkram im Kopf.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Der erste Scan dauert 30 Sekunden — und ab dann weiß Ordilo Bescheid.
            </p>
            <ul className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["Kostenlos", "Ohne Passwort", "Sofort startklar"].map((point) => (
                <li key={point} className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-[var(--petrol)]" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            <Link href="/login" className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-ordilo-sm bg-[var(--petrol)] px-8 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-testid="landing-cta-bottom">
              Kostenlos starten
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <footer className="flex flex-col items-center gap-2 px-3 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Ordilo — Dein Familienordner</p>
          <nav className="flex items-center gap-4" aria-label="Rechtliches">
            <Link href="/impressum" className="rounded-ordilo-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">Impressum</Link>
            <Link href="/datenschutz" className="rounded-ordilo-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">Datenschutz</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}

function ValueProp({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  text: string;
}) {
  return (
    <div className="p-7 md:border-r md:border-border md:last:border-r-0 lg:p-9">
      <span className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--auth-sage)]">
        <Icon className="size-5 text-[var(--petrol)]" aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function HowStep({
  step,
  icon: Icon,
  title,
  text,
}: {
  step: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 py-6 sm:py-7">
      <div className="relative flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--auth-sage)]">
        <Icon className="size-5 text-[var(--petrol)]" aria-hidden="true" />
        <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--petrol)] text-[0.6875rem] font-semibold text-white">
          {step}
        </span>
      </div>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
