import Link from "next/link";
import { OrdiloWordmark } from "@/components/ordilo/ordilo-wordmark";
import { APP_STORE_URL } from "@/lib/marketing";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--auth-background)] text-foreground">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4"
      >
        Zum Inhalt
      </a>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-10">
        <Link
          href="/"
          aria-label="Ordilo Startseite"
          className="focus-ring rounded-ordilo-sm"
        >
          <OrdiloWordmark mascotSize={32} />
        </Link>
        <nav
          aria-label="Hauptnavigation"
          className="flex flex-wrap items-center gap-4 text-sm font-medium"
        >
          <Link href="/ratgeber" className="focus-ring py-3">
            Ratgeber
          </Link>
          <Link href="/hilfe" className="focus-ring py-3">
            Hilfe
          </Link>
          <a
            href={APP_STORE_URL}
            className="focus-ring rounded-ordilo-sm bg-primary px-4 py-3 text-primary-foreground"
          >
            Für iPhone laden
          </a>
        </nav>
      </header>
      <main
        id="inhalt"
        className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-16"
      >
        {children}
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-7 text-sm text-muted-foreground sm:px-10">
        <span>Ordilo · Papierkram rein. Kopf frei.</span>
        <nav
          aria-label="Weitere Informationen"
          className="flex flex-wrap gap-5"
        >
          <Link className="focus-ring py-2" href="/impressum">
            Impressum
          </Link>
          <Link className="focus-ring py-2" href="/datenschutz">
            Datenschutz
          </Link>
          <Link className="focus-ring py-2" href="/nutzungsbedingungen">
            Nutzungsbedingungen
          </Link>
        </nav>
      </footer>
    </div>
  );
}

export function AppInvitation() {
  return (
    <aside
      className="mt-12 rounded-ordilo-md bg-[var(--petrol-darker)] p-6 text-[var(--warm-white)] sm:p-9"
      aria-label="Ordilo ausprobieren"
    >
      <h2 className="text-2xl font-semibold tracking-tight">
        Probiert es mit einem Brief aus.
      </h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-white/80">
        Brief scannen, Angaben prüfen und eine Frage stellen. Ordilo zeigt euch
        die Antwort mit Fundstelle. Scannen und Fragen sind kostenlos; das
        Live-Gespräch ist optional mit Plus erhältlich.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-5">
        <a
          href={APP_STORE_URL}
          className="focus-ring rounded-ordilo-sm bg-[var(--warm-white)] px-5 py-3 font-semibold text-[var(--petrol-darker)]"
        >
          Ordilo im App Store laden
        </a>
        <Link
          href="/login"
          className="focus-ring py-3 underline underline-offset-4"
        >
          Im Browser starten
        </Link>
      </div>
    </aside>
  );
}
