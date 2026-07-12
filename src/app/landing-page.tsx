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
    <div className="min-h-dvh bg-[var(--warm-white)] text-foreground">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <OrdiloMascot size={30} mood="idle" style={{ color: "var(--petrol)" }} />
          <span className="text-lg font-semibold tracking-tight">Ordilo</span>
        </div>
        <Link
          href="/login"
          className="rounded-ordilo-sm px-3 py-2 text-sm font-medium text-[var(--petrol)] transition-colors hover:bg-[var(--sand)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Anmelden
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8 lg:pb-20 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--petrol)]/15 bg-[var(--petrol)]/[0.06] px-3 py-1 text-xs font-medium text-[var(--petrol)]">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Das Familiengedächtnis für euren Papierkram
            </p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight lg:text-[2.75rem] lg:leading-[1.15]">
              Einmal scannen.
              <br />
              Nie wieder suchen.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground lg:text-lg">
              Ordilo liest eure Briefe, Rechnungen und Verträge, sortiert sie
              von selbst ein und merkt sich jedes Detail — von der
              Seriennummer bis zur Kündigungsfrist. Ihr fragt einfach.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-ordilo-md bg-[var(--petrol)] px-6 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid="landing-cta-hero"
              >
                Kostenlos starten
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <p className="text-xs text-muted-foreground">
                In 30 Sekunden startklar — ohne Passwort, ohne Kreditkarte.
              </p>
            </div>
          </div>

          {/* Product mock: ask → answer */}
          <div
            className="relative mx-auto w-full max-w-sm space-y-3"
            aria-hidden="true"
          >
            <div className="rounded-ordilo-md border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-medium text-[var(--mist)]">Du fragst</p>
              <p className="mt-1.5 rounded-ordilo-sm bg-[var(--sand)] px-3 py-2.5 text-sm">
                Wie ist die Seriennummer der Waschmaschine?
              </p>
            </div>
            <div className="ml-6 rounded-ordilo-md border border-[var(--petrol)]/15 bg-card p-4 shadow-card">
              <div className="flex items-center gap-2">
                <OrdiloMascot size={22} mood="helping" animate={false} style={{ color: "var(--petrol)" }} />
                <p className="text-xs font-medium text-[var(--petrol)]">Ordilo antwortet</p>
              </div>
              <div className="mt-2 flex items-center gap-2.5 rounded-ordilo-sm bg-[var(--sand-light)] px-3 py-2.5">
                <Hash className="size-4 shrink-0 text-[var(--mist-dark)]" />
                <span className="font-mono text-sm font-medium">WM-482-A93816</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Aus: Rechnung Waschmaschine · Juli 2024
              </p>
            </div>
            <div className="ml-3 flex items-center gap-2.5 rounded-ordilo-md border border-border bg-card px-4 py-3 shadow-card">
              <span className="flex size-8 items-center justify-center rounded-full bg-[var(--petrol)]/10">
                <CalendarClock className="size-4 text-[var(--petrol)]" />
              </span>
              <p className="text-sm">
                <span className="font-medium">Erinnerung:</span>{" "}
                <span className="text-muted-foreground">
                  Garantie läuft in 30 Tagen ab
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="border-y border-border bg-[var(--sand)]/60">
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-5 py-12 md:grid-cols-3 lg:py-16">
          <ValueProp
            icon={ScanLine}
            title="Scannen & vergessen"
            text="Kamera draufhalten, fertig. Ordilo erkennt, was es ist, für wen es ist und wohin es gehört — und sortiert es selbst ein."
          />
          <ValueProp
            icon={MessageCircleQuestion}
            title="Einfach fragen"
            text="„Was steht im Kita-Vertrag zur Kündigung?“ Ordilo findet die Antwort in euren Dokumenten — nicht nur das Dokument."
          />
          <ValueProp
            icon={BellRing}
            title="Nichts mehr verpassen"
            text="Fristen, Zahlungen, Garantien: Ordilo liest sie aus euren Dokumenten und erinnert euch, bevor es teuer wird."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-5xl px-5 py-12 lg:py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          So funktioniert&apos;s
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <HowStep
            step="1"
            icon={Camera}
            title="Scannen"
            text="Dokument mit dem Handy abfotografieren — auch mehrseitig, auch als PDF."
          />
          <HowStep
            step="2"
            icon={Sparkles}
            title="Ordilo sortiert"
            text="Personen, Beträge, Fristen, Nummern: alles wird erkannt und automatisch abgelegt."
          />
          <HowStep
            step="3"
            icon={MessageCircleQuestion}
            title="Einfach fragen"
            text="Per Text oder Stimme — Ordilo antwortet mit dem Inhalt, nicht mit einem Suchtreffer."
          />
        </div>
      </section>

      {/* Family + privacy */}
      <section className="border-y border-border bg-[var(--sand)]/60">
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-5 py-12 md:grid-cols-2 lg:py-16">
          <div className="rounded-ordilo-md border border-border bg-card p-6 shadow-card">
            <span className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/[0.08]">
              <Users className="size-5 text-[var(--petrol)]" aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-base font-semibold">Für die ganze Familie</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Ein gemeinsames Familienbuch statt fünf Ablagesysteme. Ladet
              euch gegenseitig ein — jeder scannt, alle finden.
            </p>
          </div>
          <div className="rounded-ordilo-md border border-border bg-card p-6 shadow-card">
            <span className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/[0.08]">
              <Lock className="size-5 text-[var(--petrol)]" aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-base font-semibold">Eure Dokumente gehören euch</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Private Ablage, nur für eure Familie zugänglich. Keine Werbung,
              kein Verkauf von Daten — euer Papierkram ist kein Produkt.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto w-full max-w-5xl px-5 py-14 text-center lg:py-20">
        <OrdiloMascot
          size={56}
          mood="greeting"
          className="mx-auto"
          style={{ color: "var(--petrol)" }}
        />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">
          Weniger Papierkram im Kopf.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Der erste Scan dauert 30 Sekunden — und ab dann weiß Ordilo Bescheid.
        </p>
        <ul className="mx-auto mt-5 flex max-w-md flex-col items-center gap-1.5 text-sm text-muted-foreground sm:flex-row sm:justify-center sm:gap-5">
          {["Kostenlos", "Ohne Passwort", "Sofort startklar"].map((point) => (
            <li key={point} className="flex items-center gap-1.5">
              <Check className="size-3.5 text-[var(--petrol)]" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        <Link
          href="/login"
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-ordilo-md bg-[var(--petrol)] px-8 text-sm font-medium text-white transition-colors hover:bg-[var(--petrol-dark)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-testid="landing-cta-bottom"
        >
          Kostenlos starten
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-5 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Ordilo — Dein Familienordner</p>
          <p>Mit Sorgfalt gebaut für Familien mit vollem Kopf.</p>
        </div>
      </footer>
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
    <div className="rounded-ordilo-md border border-border bg-card p-6 shadow-card">
      <span className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--petrol)]/[0.08]">
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
    <div className="text-center">
      <div className="relative mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--sand-light)]">
        <Icon className="size-6 text-[var(--petrol)]" aria-hidden="true" />
        <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-[var(--petrol)] text-xs font-semibold text-white">
          {step}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {text}
      </p>
    </div>
  );
}
