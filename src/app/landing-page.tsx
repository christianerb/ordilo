import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  FileText,
  Lock,
  MessageCircleQuestion,
  Mic,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";
import { OrdiloMark } from "@/components/ordilo/ordilo-mark";
import { OrdiloWordmark } from "@/components/ordilo/ordilo-wordmark";

const faqItems = [
  {
    question: "Was ist der Unterschied zu einem Cloud-Ordner?",
    answer:
      "Ein Cloud-Ordner speichert Dateien. Ordilo versteht, was darin steht: Beträge, Fristen, Personen und wichtige Nummern. Du fragst und bekommst eine Antwort statt einer Trefferliste.",
  },
  {
    question: "Kann das nicht auch ChatGPT?",
    answer:
      "Bei einem allgemeinen Chat müsstest du Dokumente immer wieder hochladen. Ordilo baut daraus eine geschützte Familienablage, merkt sich bestätigte Informationen und erinnert dich an Fristen.",
  },
  {
    question: "Wer kann meine Dokumente lesen?",
    answer:
      "Nur deine Familie hat Zugriff auf die private Ablage. Für die Dokumentenanalyse arbeiten geprüfte KI-Partner unter Auftragsverarbeitung. Sie lernen nicht aus deinen Daten.",
  },
  {
    question: "Was kostet Ordilo?",
    answer:
      "Der Einstieg ist kostenlos und bleibt kostenlos. Für größere Familienarchive kommt später ein faires Abo dazu. Bevor sich daran etwas ändert, sagen wir klar Bescheid.",
  },
] as const;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Ordilo",
      applicationCategory: "ProductivityApplication",
      operatingSystem: "iOS, Android, Web",
      description:
        "Ordilo ist die mobile Dokumenten-App für Familien. Sie liest Briefe, Rechnungen und Verträge, beantwortet Fragen und erinnert an Fristen.",
      isAccessibleForFree: true,
      url: "https://ordilo.de",
    },
    {
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ],
};

export function LandingPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-[var(--auth-background)] text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div
        className="pointer-events-none fixed -left-32 top-24 size-80 rounded-full bg-[var(--auth-blue-wash)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -right-32 top-[32rem] size-96 rounded-full bg-[var(--auth-apricot-wash)]"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl sm:px-6 sm:py-6 lg:px-10">
        <section className="relative overflow-hidden bg-[var(--petrol-darker)] text-[var(--warm-white)] sm:rounded-ordilo-md">
          <div
            className="pointer-events-none absolute -right-28 -top-20 size-80 rounded-full bg-[var(--petrol)] opacity-60"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-32 left-[28%] h-72 w-[34rem] -rotate-6 rounded-[28px] bg-[var(--auth-sage)] opacity-10"
            aria-hidden="true"
          />

          <header className="relative z-20 flex items-center justify-between px-5 py-4 sm:px-9 sm:py-5 lg:px-12">
            <OrdiloWordmark
              mascotSize={32}
              className="landing-wordmark"
              labelClassName="text-xl font-semibold tracking-[-0.03em] text-[var(--warm-white)]"
            />
            <Link
              href="/login"
              className="focus-ring inline-flex min-h-11 items-center rounded-ordilo-sm px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Anmelden
            </Link>
          </header>

          <div className="relative grid items-center lg:grid-cols-[0.92fr_1.08fr]">
            <div className="relative z-10 px-5 pb-6 pt-5 sm:px-10 sm:pb-14 sm:pt-12 lg:px-12 lg:py-20">
              <h1
                className="max-w-xl font-semibold leading-[0.95] tracking-[-0.04em]"
                style={{ fontSize: "clamp(3rem, 11vw, 5.25rem)" }}
              >
                Scannen.
                <br />
                Fragen.
                <br />
                <span className="text-[var(--auth-sage)]">Erledigt.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg font-medium leading-relaxed text-white sm:mt-7 sm:text-xl">
                Die Dokumenten-App, die den Papierkram deiner Familie versteht.
                <span className="mt-1 block text-base font-normal text-white/70">
                  Brief fotografieren, Ordilo fragen, Fristen im Blick behalten.
                </span>
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className="focus-ring press-scale inline-flex min-h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-ordilo-sm bg-[var(--warm-white)] px-6 text-sm font-semibold text-[var(--petrol-darker)] transition-colors hover:bg-[var(--auth-sage)]"
                  data-testid="landing-cta-hero"
                >
                  Ordilo kostenlos starten
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <p className="text-sm text-white/65">
                  Ohne Kreditkarte. Ohne Passwort.
                </p>
              </div>

              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/75 sm:mt-8">
                <li className="flex items-center gap-2">
                  <Lock className="size-4 text-[var(--auth-sage)]" aria-hidden="true" />
                  Private Familienablage
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[var(--auth-sage)]" aria-hidden="true" />
                  Server in der EU
                </li>
              </ul>
            </div>

            <div className="relative flex min-h-[560px] items-end justify-center overflow-hidden px-4 pt-0 sm:min-h-[680px] sm:px-10 sm:pt-6 lg:min-h-[720px] lg:items-center lg:pt-0">
              <div
                className="absolute inset-x-6 bottom-0 h-[78%] rounded-t-[28px] bg-[var(--auth-sage)] opacity-90 sm:inset-x-12 lg:inset-x-8 lg:bottom-auto lg:h-[78%] lg:rounded-[28px]"
                aria-hidden="true"
              />
              <MobileAppPreview />
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-4 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
              Ein Brief. Drei Sorgen weniger.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Ordilo macht aus einem Foto genau das, was deine Familie später
              wirklich braucht: Antworten und rechtzeitige Hinweise.
            </p>
          </div>

          <ol className="mx-auto mt-10 grid max-w-5xl gap-0 overflow-hidden rounded-ordilo-md bg-[var(--surface-box)] shadow-card md:grid-cols-3">
            <JourneyStep
              icon={ScanLine}
              title="Brief scannen"
              text="Kamera draufhalten. Dein Handy übernimmt Kanten, Zuschnitt und mehrere Seiten."
            />
            <JourneyStep
              icon={Sparkles}
              title="Ordilo versteht ihn"
              text="Beträge, Personen, Verträge und Fristen werden erkannt und sinnvoll abgelegt."
            />
            <JourneyStep
              icon={BellRing}
              title="Du bleibst entspannt"
              text="Frag nach Details oder lass dich erinnern, bevor etwas wichtig oder teuer wird."
            />
          </ol>
        </section>

        <section className="mx-4 overflow-hidden rounded-ordilo-md bg-[var(--surface-box)] shadow-card sm:mx-0">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col justify-between bg-[var(--auth-story-surface)] p-6 sm:p-10 lg:p-12">
              <div>
                <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">
                  Nicht suchen.
                  <br />
                  Einfach fragen.
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                  Ordilo liefert nicht nur die richtige Datei. Du bekommst die
                  Antwort und siehst sofort, aus welchem Dokument sie stammt.
                </p>
              </div>
              <div className="mt-10 flex items-end justify-between gap-4">
                <p className="max-w-xs text-sm text-muted-foreground">
                  Per Text oder Stimme, wenn gerade keine Hand frei ist.
                </p>
                <OrdiloMascot
                  size={78}
                  mood="helping"
                  animate={false}
                  className="landing-mascot-static shrink-0 text-[var(--petrol)]"
                />
              </div>
            </div>

            <div className="bg-[var(--petrol-darker)] p-5 text-white sm:p-10 lg:p-12">
              <div className="ml-auto max-w-lg">
                <div className="ml-10 rounded-ordilo-sm bg-[var(--petrol)] px-4 py-4 text-sm leading-relaxed sm:text-base">
                  Wann kann ich den Handyvertrag von Lea kündigen?
                </div>
                <div className="mt-4 rounded-ordilo-sm bg-[var(--warm-white)] p-5 text-[var(--graphite)]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--petrol)]">
                    <OrdiloMark size={28} />
                    Ordilo antwortet
                  </div>
                  <p className="mt-4 text-xl font-semibold leading-snug">
                    Der Vertrag kann zum 30. September gekündigt werden.
                  </p>
                  <div className="mt-5 flex items-center gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
                    <FileText className="size-4 shrink-0" aria-hidden="true" />
                    Mobilfunkvertrag Lea · bestätigt
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-ordilo-sm bg-[var(--auth-sage)] px-4 py-3 text-sm text-[var(--petrol-darker)]">
                  <CalendarClock className="size-5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>Erinnerung gesetzt:</strong> 30 Tage vorher
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-4 sm:py-20 lg:py-24">
          <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <OrdiloMascot
                size={64}
                mood="greeting"
                animate={false}
                className="landing-mascot-static text-[var(--petrol)]"
              />
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">
                Für die Person, die sonst alles im Kopf hat.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                Einer scannt, alle wissen Bescheid. Aufgaben, Dokumente und
                Fristen bleiben dort, wo die ganze Familie sie findet.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-ordilo-md bg-border sm:grid-cols-2">
              <FamilyBenefit
                icon={Camera}
                title="Immer dabei"
                text="Post direkt beim Öffnen scannen, statt sie später noch einmal in die Hand zu nehmen."
              />
              <FamilyBenefit
                icon={Mic}
                title="Mit einer Hand"
                text="Fragen einsprechen, Antworten hören und Fristen unterwegs prüfen."
              />
              <FamilyBenefit
                icon={Users}
                title="Für alle"
                text="Familienmitglieder sehen dieselben bestätigten Informationen und Aufgaben."
              />
              <FamilyBenefit
                icon={Lock}
                title="Privat gebaut"
                text="Verschlüsselt, ohne Werbung und mit Zugriff nur für deine Familie."
              />
            </div>
          </div>
        </section>

        <section className="mx-4 overflow-hidden rounded-ordilo-md bg-[var(--petrol-darker)] text-white sm:mx-0">
          <div className="grid lg:grid-cols-[1fr_0.9fr]">
            <div className="p-6 sm:p-10 lg:p-12">
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">
                Deine privatesten Papiere verdienen mehr als ein Versprechen.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70">
                Ordilo ist für Familien gebaut, nicht für Werbung. Deine
                Dokumente bleiben verschlüsselt und werden nicht verkauft.
              </p>
              <Link
                href="/datenschutz"
                className="focus-ring mt-7 inline-flex min-h-11 items-center gap-2 rounded-ordilo-sm text-sm font-semibold text-[var(--auth-sage)] underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
              >
                So schützen wir deine Daten
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="grid gap-px bg-white/10 sm:grid-cols-3 lg:grid-cols-1">
              {[
                "Server in der Europäischen Union",
                "Verschlüsselt auf dem Weg und im Speicher",
                "Keine Werbung und kein Verkauf deiner Daten",
              ].map((item) => (
                <li
                  key={item}
                  className="flex min-h-20 items-center gap-3 bg-[var(--petrol-darker)] px-6 py-5 text-sm text-white/85"
                >
                  <Check className="size-5 shrink-0 text-[var(--auth-sage)]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-4 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Noch wichtig.
            </h2>
            <div className="mt-5 divide-y divide-border">
              {faqItems.map((item) => (
                <FaqItem key={item.question} {...item} />
              ))}
            </div>
          </div>
        </section>

        <section className="relative mx-4 mb-5 overflow-hidden rounded-ordilo-md bg-[var(--auth-sage)] px-6 py-12 text-center sm:mx-0 sm:mb-6 sm:px-10 sm:py-16">
          <div
            className="pointer-events-none absolute -left-20 -top-20 size-56 rounded-full bg-[var(--auth-blue-wash)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-28 -right-16 size-64 rounded-full bg-[var(--auth-apricot-wash)]"
            aria-hidden="true"
          />
          <div className="relative">
            <OrdiloMascot
              size={72}
              mood="greeting"
              animate={false}
              className="landing-mascot-static mx-auto text-[var(--petrol)]"
            />
            <h2 className="mx-auto mt-5 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
              Weniger Papierkram. Mehr Kopf frei.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[var(--mist-dark)]">
              Der erste Scan dauert weniger als eine Minute. Danach ist jede
              Antwort nur eine Frage entfernt.
            </p>
            <Link
              href="/login"
              className="focus-ring press-scale mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-ordilo-sm bg-[var(--petrol)] px-7 text-sm font-semibold text-[var(--warm-white)] transition-colors hover:bg-[var(--petrol-dark)]"
              data-testid="landing-cta-bottom"
            >
              Ordilo kostenlos starten
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <footer className="flex flex-col items-center gap-3 px-5 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Ordilo · Dein Familiengedächtnis</p>
          <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Kontakt und Rechtliches">
            <a href="mailto:info@ordilo.de" className="focus-ring inline-flex min-h-11 items-center rounded-ordilo-sm px-3 transition-colors hover:text-foreground">
              Kontakt
            </a>
            <Link href="/impressum" className="focus-ring inline-flex min-h-11 items-center rounded-ordilo-sm px-3 transition-colors hover:text-foreground">
              Impressum
            </Link>
            <Link href="/datenschutz" className="focus-ring inline-flex min-h-11 items-center rounded-ordilo-sm px-3 transition-colors hover:text-foreground">
              Datenschutz
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}

function MobileAppPreview() {
  return (
    <div className="landing-phone-enter relative z-10 w-full max-w-[360px] translate-y-5 sm:max-w-[390px] sm:translate-y-8 lg:translate-y-10">
      <div className="rounded-t-[28px] border-x-[6px] border-t-[6px] border-[var(--graphite)] bg-[var(--warm-white)] px-4 pb-9 pt-4 text-[var(--graphite)] shadow-[0_16px_40px_rgba(25,50,50,0.22)]">
        <div className="mx-auto h-5 w-24 rounded-full bg-[var(--graphite)]" aria-hidden="true" />

        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--mist-dark)]">Guten Morgen</p>
            <p className="mt-0.5 text-xl font-semibold text-[var(--petrol-darker)]">
              Was liegt heute an?
            </p>
          </div>
          <span className="flex size-11 items-center justify-center rounded-full bg-[var(--auth-sage)] text-[var(--petrol)]">
            <OrdiloMark size={34} />
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-ordilo-sm bg-[var(--auth-story-surface)]">
          <div className="landing-app-reveal landing-app-reveal--notice flex items-center gap-3 bg-[var(--auth-apricot-wash)] px-4 py-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-[var(--warm-white)] text-[var(--apricot-text)]">
              <BellRing className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-medium text-[var(--apricot-text)]">Ordilo hat etwas bemerkt</p>
              <p className="text-sm font-semibold text-[var(--graphite)]">Kündigungsfrist in 30 Tagen</p>
            </div>
          </div>
          <div className="landing-app-reveal landing-app-reveal--document flex items-center gap-3 px-4 py-4">
            <span className="flex size-10 items-center justify-center rounded-ordilo-sm bg-[var(--warm-white)] text-[var(--petrol)] shadow-card">
              <FileText className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Mobilfunkvertrag Lea</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Heute erkannt · bestätigt</p>
            </div>
            <ChevronDown className="size-4 -rotate-90 text-[var(--mist-dark)]" aria-hidden="true" />
          </div>
        </div>

        <div className="landing-app-reveal landing-app-reveal--question mt-4 rounded-ordilo-sm bg-[var(--petrol)] p-4 text-white">
          <div className="flex items-center gap-2 text-xs font-medium text-white/65">
            <MessageCircleQuestion className="size-4" aria-hidden="true" />
            Ordilo fragen
          </div>
          <p className="mt-2 text-base font-medium leading-snug">
            Wann kann ich Leas Vertrag kündigen?
          </p>
          <div className="landing-app-reveal landing-app-reveal--answer mt-4 rounded-ordilo-sm bg-[var(--warm-white)] p-3 text-sm leading-relaxed text-[var(--graphite)]">
            Zum <strong>30. September</strong>. Soll ich dich vorher erinnern?
          </div>
        </div>

        <div className="landing-app-reveal landing-app-reveal--nav mt-4 grid grid-cols-3 gap-2">
          {[
            { icon: ScanLine, label: "Scannen" },
            { icon: MessageCircleQuestion, label: "Fragen" },
            { icon: CalendarClock, label: "Planen" },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-ordilo-sm bg-[var(--sand)] text-xs font-medium text-[var(--petrol-darker)]"
            >
              <Icon className="size-5 text-[var(--petrol)]" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function JourneyStep({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  text: string;
}) {
  return (
    <li className="relative flex gap-4 border-b border-border p-6 last:border-b-0 md:block md:border-b-0 md:border-r md:last:border-r-0 md:p-8">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-ordilo-sm bg-[var(--auth-sage)] text-[var(--petrol)]">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="md:mt-5">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

function FamilyBenefit({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  title: string;
  text: string;
}) {
  return (
    <article className="bg-[var(--surface-box)] p-6 sm:p-7">
      <Icon className="size-5 text-[var(--petrol)]" aria-hidden="true" />
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <details className="group">
      <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-ordilo-sm py-3 text-base font-semibold [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDown
          className="landing-faq-chevron size-5 shrink-0 text-[var(--mist-dark)] group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <p className="landing-faq-answer max-w-2xl pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">
        {answer}
      </p>
    </details>
  );
}
