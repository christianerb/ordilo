import { redirect } from "next/navigation";
import { getCodeEligibleAdmin, getVerifiedAdmin } from "@/lib/admin/access";
import { getPlatformOverview } from "@/lib/admin/platform-data";
import { formatGermanDateTime } from "@/lib/format";
import { AdminLogoutButton } from "./admin-logout-button";
import { getBetaOverview } from "@/lib/admin/beta-data";
import { getUsageOverview } from "@/lib/admin/usage-data";

export const metadata = {
  title: "Plattformübersicht | Ordilo",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;
const OPERATION_LABELS: Record<string, string> = {
  document_total: "Dokument (OCR, Analyse, Embeddings)", chat: "Chatfrage", search: "Suchanfrage",
  voice_transcription: "Spracheingabe", browser_voice: "Browser-Sprachsitzung (Verbrauch offen)", email_analysis: "E-Mail-Analyse",
};

function parseDays(value: string | string[] | undefined): 7 | 30 | 90 {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "7") return 7;
  if (raw === "90") return 90;
  return 30;
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getCodeEligibleAdmin())) redirect("/login");
  if (!(await getVerifiedAdmin())) redirect("/admin/access");

  const params = await searchParams;
  const days = parseDays(params.days);
  const requestedPage = parsePage(params.page);
  const overview = await getPlatformOverview(days);
  const beta = await getBetaOverview(days);
  const usage = await getUsageOverview();
  const accountEmails = new Map(overview.accounts.map((account) => [account.id, account.email]));
  const pages = Math.max(1, Math.ceil(overview.accounts.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const visibleAccounts = overview.accounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const maxDailyActivity = Math.max(
    1,
    ...overview.dailyMetrics.map((metric) => metric.activeAccounts),
  );

  const metrics = [
    { label: "Konten gesamt", value: formatNumber(overview.accountsTotal) },
    { label: `Neue Konten (${days} Tage)`, value: formatNumber(overview.accountsNew) },
    { label: `Aktive Konten (${days} Tage)`, value: formatNumber(overview.accountsActive) },
    { label: "Familien", value: formatNumber(overview.familiesTotal) },
    {
      label: "Konten je Familie",
      value: formatNumber(overview.averageAccountsPerFamily),
    },
    {
      label: "Mitglieder je Familie",
      value: formatNumber(overview.averageMembersPerFamily),
    },
  ];

  return (
    <main className="min-h-dvh bg-[var(--canvas-warm)] p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-ordilo-md border border-border bg-card p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Ordilo intern</p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">
              Plattformübersicht
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Nutzungsdaten ohne Dokumente, Chats oder Suchbegriffe. Aktiv heißt:
              Login oder Produktnutzung im gewählten Zeitraum.
            </p>
          </div>
          <AdminLogoutButton />
        </header>

        <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg font-semibold">Beta: vom Einstieg zur Nutzung</h2>
          <p className="mt-2 text-sm text-muted-foreground">Letzte {days} Tage, Tagesgrenzen in UTC. Einstiegskohorte: Personen mit Onboarding-Start im Zeitraum; spätere Abschlüsse und erste Uploads derselben Personen. Ein Login allein zählt hier nicht als Produktaktivität.</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ["Onboarding gestartet", beta.started],
              ["Onboarding abgeschlossen", beta.completed],
              ["Abschlussquote", beta.completionRate === null ? "Noch keine Starts" : `${Math.round(beta.completionRate * 100)} %`],
              ["Personen mit erstem Upload", beta.firstUpload],
              ["Aktive Personen", beta.activeUsers],
              ["Dokumente angelegt (noch vorhanden)", beta.documents],
              ["Suchanfragen abgeschlossen", beta.searches],
              ["Chatfragen gesendet", beta.questions],
              ["Dokumente in Verarbeitung", beta.processing],
              ["Dokumente zur Prüfung", beta.awaitingReview],
              ["Dokumente fehlgeschlagen", beta.failed],
            ].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>)}
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">Fehler nach Verarbeitungsschritt: {beta.failureStages.map(({ stage, count }) => `${({ upload: "Upload", ocr: "Texterkennung", analyze: "Analyse", embed: "Suchindex" } as Record<string, string>)[stage]} ${count}`).join(" · ")}. Noch nicht hochgeladene lokale Dateien sind hier nicht sichtbar.</p>
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-medium">Wo stehen die neuen Nutzer?</summary>
            <p className="mt-2 text-sm text-muted-foreground">Letzter belegter Einstiegsschritt; kein automatisch behaupteter Abbruch.</p>
            <table className="mt-3 w-full text-left text-sm"><thead><tr><th>Nutzer</th><th>Letzter Schritt</th><th>Zeitpunkt</th></tr></thead><tbody>{beta.lastSteps.map((row) => <tr key={row.userId}><td className="py-2">{accountEmails.get(row.userId) ?? row.userId}</td><td>{row.step}</td><td>{formatGermanDateTime(row.at)}</td></tr>)}</tbody></table>
          </details>
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-medium">Täglich aktive Personen (Produktnutzung)</summary>
            {beta.daily.length ? <table className="mt-3 w-full text-left text-sm"><thead><tr><th>Tag (UTC)</th><th>Personen</th></tr></thead><tbody>{beta.daily.map(({ day, users }) => <tr key={day}><td className="py-1">{day}</td><td>{users}</td></tr>)}</tbody></table> : <p className="mt-2 text-sm text-muted-foreground">Noch keine Produktaktivität erfasst.</p>}
          </details>
        </section>

        <section className="overflow-x-auto rounded-ordilo-md border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg font-semibold">API-Verbrauch und variable Kosten</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ab Beginn der Erfassung, maximal 12 Monate, unabhängig vom Zeitraumfilter. USD-Schätzung ohne Fixkosten. Tokens enthalten Eingabe und Ausgabe; Cache-Tokens sind bereits in der Eingabe enthalten. Fehlende Preise und Versuche ohne Endabrechnung bleiben unbekannt. Erfasst: Dokumentanalyse, Embeddings, Chat, Suche, E-Mail-Analyse und OCR-Abrechnung. Native Spracheingabe wird erfasst, ist noch nicht bepreist; Browser-Realtime fehlt noch. Diese Ansicht ersetzt keine Anbieterrechnung.</p>
          {!usage.available ? <p className="mt-3">Verbrauchsdaten nicht verfügbar. Migration 0079 und Datenbankzugriff prüfen.</p> : <>
            <table className="mt-4 w-full text-left text-sm"><thead><tr><th>Nutzer</th><th>Monat (UTC)</th><th>API-Aufrufe</th><th>Erfasste Tokens</th><th>Bekannte Kosten (USD)</th><th>Aufrufe ohne Preis</th></tr></thead><tbody>
              {usage.accounts.map((row) => <tr key={`${row.userId}:${row.month}`}><td className="py-2">{row.userId ? accountEmails.get(row.userId) ?? row.userId : "Nicht zugeordnet"}</td><td>{row.month}</td><td>{row.calls}</td><td>{formatNumber(row.tokens)}</td><td>{row.knownUsd.toFixed(5)}</td><td>{row.unknownCosts}</td></tr>)}
            </tbody></table>
            {!usage.accounts.length && <p className="mt-3 text-sm text-muted-foreground">Noch kein API-Verbrauch erfasst. Frühere Kosten werden nicht rückwirkend geschätzt.</p>}
            <table className="mt-5 w-full text-left text-sm"><thead><tr><th>Vorgang</th><th>Dokumente / Anfragen</th><th>API-Aufrufe</th><th>Ø bekannte vollständige Kosten (USD)</th></tr></thead><tbody>
              {usage.operations.map((row) => <tr key={row.operation}><td className="py-2">{OPERATION_LABELS[row.operation] ?? row.operation}</td><td>{row.units}</td><td>{row.calls}</td><td>{row.averageUsd === null ? "Unvollständig" : row.averageUsd.toFixed(5)}</td></tr>)}
            </tbody></table>
          </>}
        </section>

        <nav className="flex gap-2" aria-label="Zeitraum auswählen">
          {([7, 30, 90] as const).map((option) => (
            <a
              key={option}
              href={`/admin?days=${option}`}
              className={
                days === option
                  ? "rounded-ordilo-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  : "rounded-ordilo-sm border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
              }
            >
              {option} Tage
            </a>
          ))}
        </nav>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Kennzahlen">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded-ordilo-sm border border-border bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Letzte 30 Tage
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Balken zeigen aktive Konten, die Zahlen darunter neue Anmeldungen.
            </p>
          </div>
          <div className="mt-6 grid h-36 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1">
            {overview.dailyMetrics.map((metric) => (
              <div key={metric.date} className="flex h-full min-w-0 flex-col justify-end">
                <div
                  className="rounded-t bg-primary/75"
                  style={{
                    height: `${Math.max(
                      4,
                      (metric.activeAccounts / maxDailyActivity) * 100,
                    )}%`,
                  }}
                  title={`${metric.date}: ${metric.activeAccounts} aktiv, ${metric.registrations} neu`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{overview.dailyMetrics[0]?.date}</span>
            <span>{overview.dailyMetrics.at(-1)?.date}</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-ordilo-md border border-border bg-card shadow-card">
          <div className="border-b border-border p-5">
            <h2 className="text-base font-semibold text-foreground">Konten für Support</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              E-Mail, Anmelde- und Aktivitätszeitpunkt sowie Familienzuordnung.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-secondary/70 text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">E-Mail</th>
                  <th className="px-5 py-3 font-medium">Angemeldet</th>
                  <th className="px-5 py-3 font-medium">Letzter Login</th>
                  <th className="px-5 py-3 font-medium">Letzte Nutzung</th>
                  <th className="px-5 py-3 font-medium">Familien</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((account) => (
                  <tr key={account.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium text-foreground">{account.email}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatGermanDateTime(account.createdAt)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatGermanDateTime(account.lastSignInAt)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatGermanDateTime(account.lastActivityAt)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{account.familyCount}</td>
                  </tr>
                ))}
                {visibleAccounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                      Noch keine Konten vorhanden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="flex items-center justify-between border-t border-border p-4 text-sm" aria-label="Kontenseiten">
              {page > 1 ? (
                <a className="text-primary hover:underline" href={`/admin?days=${days}&page=${page - 1}`}>
                  Zurück
                </a>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Seite {page} von {pages}
              </span>
              {page < pages ? (
                <a className="text-primary hover:underline" href={`/admin?days=${days}&page=${page + 1}`}>
                  Weiter
                </a>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
