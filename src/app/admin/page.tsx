import { redirect } from "next/navigation";
import { getCodeEligibleAdmin, getVerifiedAdmin } from "@/lib/admin/access";
import { getPlatformOverview } from "@/lib/admin/platform-data";
import { formatGermanDateTime } from "@/lib/format";
import { AdminLogoutButton } from "./admin-logout-button";

export const metadata = {
  title: "Plattformübersicht | Ordilo",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

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
