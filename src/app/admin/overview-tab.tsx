import { getPlatformOverview } from "@/lib/admin/platform-data";
import { getHappinessOverview } from "@/lib/admin/happiness-data";
import {
  ACCOUNT_STATUS_LABELS,
  classifyAccountActivity,
  summarizeRetention,
  summarizeStickiness,
  type AccountActivityStatus,
} from "@/lib/admin/account-status";
import { formatGermanDateTime, formatRelativeTime } from "@/lib/format";
import { AdminPeriodNav, formatAdminNumber } from "./period-nav";

const STATUS_ORDER: AccountActivityStatus[] = ["aktiv", "inaktiv", "lange_nicht_da"];

function formatPercent(rate: number | null): string {
  if (rate === null) return "Noch keine Daten";
  return `${Math.round(rate * 100)} %`;
}

export async function AdminOverviewTab({ days }: { days: 7 | 30 | 90 }) {
  const [overview, happiness] = await Promise.all([
    getPlatformOverview(days),
    getHappinessOverview(),
  ]);
  const maxDailyActivity = Math.max(
    1,
    ...overview.dailyMetrics.map((metric) => metric.activeAccounts),
  );
  const maxDailyUploads = Math.max(
    1,
    ...overview.dailyMetrics.map((metric) => metric.uploads),
  );
  const maxDailyRegistrations = Math.max(
    1,
    ...overview.dailyMetrics.map((metric) => metric.registrations),
  );

  const statusCounts: Record<AccountActivityStatus, number> = {
    aktiv: 0,
    inaktiv: 0,
    lange_nicht_da: 0,
  };
  for (const account of overview.accounts) {
    statusCounts[classifyAccountActivity(account)] += 1;
  }

  const retention = summarizeRetention(overview.accounts);
  const stickiness = summarizeStickiness(
    overview.accounts,
    overview.dailyMetrics.map((metric) => metric.activeAccounts),
  );

  // Cumulative account count per day for the growth chart tooltips.
  const registrationsInWindow = overview.dailyMetrics.reduce(
    (sum, metric) => sum + metric.registrations,
    0,
  );
  let runningTotal = overview.accountsTotal - registrationsInWindow;
  const growth = overview.dailyMetrics.map((metric) => {
    runningTotal += metric.registrations;
    return { ...metric, total: runningTotal };
  });

  const feedback = happiness.feedback;
  const healthMetrics = [
    {
      label: "Chat-Feedback positiv",
      value: formatPercent(feedback.window.positiveRate),
      detail: `${feedback.window.positive + feedback.window.negative} Bewertungen in 30 Tagen`,
    },
    {
      label: "Wiederkehrer-Quote",
      value: formatPercent(retention.rate),
      detail: `${retention.returned} von ${retention.eligible} Konten älter als 7 Tage waren diese Woche da`,
    },
    {
      label: "Engagement",
      value: formatPercent(stickiness.ratio),
      detail: `Ø ${formatAdminNumber(stickiness.averageDailyActive)} täglich aktive von ${stickiness.active30Days} aktiven Konten (30 Tage)`,
    },
    {
      label: "Dokumente fehlgeschlagen",
      value: formatAdminNumber(happiness.failedDocuments.total),
      detail: `${happiness.failedDocuments.last30Days} davon in den letzten 30 Tagen`,
    },
  ];

  const metrics = [
    { label: "Konten gesamt", value: formatAdminNumber(overview.accountsTotal) },
    { label: `Neue Konten (${days} Tage)`, value: formatAdminNumber(overview.accountsNew) },
    { label: `Aktive Konten (${days} Tage)`, value: formatAdminNumber(overview.accountsActive) },
    { label: "Familien", value: formatAdminNumber(overview.familiesTotal) },
    { label: "Konten je Familie", value: formatAdminNumber(overview.averageAccountsPerFamily) },
    { label: "Mitglieder je Familie", value: formatAdminNumber(overview.averageMembersPerFamily) },
    { label: "Dokumente gesamt", value: formatAdminNumber(overview.documentsTotal) },
    ...STATUS_ORDER.map((status) => ({
      label: `Konten: ${ACCOUNT_STATUS_LABELS[status]}`,
      value: formatAdminNumber(statusCounts[status]),
    })),
  ];

  return (
    <>
      <AdminPeriodNav tab="uebersicht" days={days} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Kennzahlen">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-ordilo-sm border border-border bg-card p-4 shadow-card">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-base font-semibold text-foreground">Aktive Konten, letzte 30 Tage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Balken zeigen aktive Konten, die Zahlen im Tooltip neue Anmeldungen.
          </p>
        </div>
        <div className="mt-6 grid h-36 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1">
          {overview.dailyMetrics.map((metric) => (
            <div key={metric.date} className="flex h-full min-w-0 flex-col justify-end">
              <div
                className="rounded-t bg-primary/75"
                style={{
                  height: `${Math.max(4, (metric.activeAccounts / maxDailyActivity) * 100)}%`,
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

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-base font-semibold text-foreground">Wachstum, letzte 30 Tage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Neue Anmeldungen pro Tag, der Tooltip zeigt den kumulierten Kontostand.
          </p>
        </div>
        <div className="mt-6 grid h-36 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1">
          {growth.map((metric) => (
            <div key={metric.date} className="flex h-full min-w-0 flex-col justify-end">
              <div
                className="rounded-t bg-primary/60"
                style={{
                  height: `${Math.max(4, (metric.registrations / maxDailyRegistrations) * 100)}%`,
                }}
                title={`${metric.date}: ${metric.registrations} neu, ${metric.total} Konten insgesamt`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{growth[0]?.date}</span>
          <span>{growth.at(-1)?.date}</span>
        </div>
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-base font-semibold text-foreground">Gesundheit und Zufriedenheit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Wie es Ordilo gerade geht: kommen Leute wieder, klappt die Verarbeitung, und wie bewerten sie die Antworten.
          </p>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {healthMetrics.map((metric) => (
            <div key={metric.label} className="rounded-ordilo-sm border border-border bg-secondary/40 p-4">
              <dt className="text-sm text-muted-foreground">{metric.label}</dt>
              <dd className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</dd>
              <dd className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</dd>
            </div>
          ))}
        </dl>
        {feedback.topReasons.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Häufigste Gründe für Daumen runter: {feedback.topReasons.map((reason) => `${reason.label} (${reason.count})`).join(" · ")}.
          </p>
        )}
        {feedback.recentComments.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Neueste Feedback-Kommentare</summary>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr><th>Zeitpunkt</th><th>Bewertung</th><th>Art der Frage</th><th>Kommentar</th></tr>
              </thead>
              <tbody>
                {feedback.recentComments.map((comment) => (
                  <tr key={`${comment.createdAt}:${comment.comment}`}>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground" title={formatGermanDateTime(comment.createdAt)}>
                      {formatRelativeTime(comment.createdAt) ?? comment.createdAt}
                    </td>
                    <td className="py-2 pr-4">{comment.rating === "positive" ? "Positiv" : "Negativ"}</td>
                    <td className="py-2 pr-4">{comment.queryKind}</td>
                    <td className="py-2">{comment.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-base font-semibold text-foreground">Scans pro Tag, letzte 30 Tage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hochgeladene Dokumente je Tag. Scans, Fotos und Dateien zählen gleich.
          </p>
        </div>
        <div className="mt-6 grid h-36 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1">
          {overview.dailyMetrics.map((metric) => (
            <div key={metric.date} className="flex h-full min-w-0 flex-col justify-end">
              <div
                className="rounded-t bg-primary/45"
                style={{
                  height: `${Math.max(4, (metric.uploads / maxDailyUploads) * 100)}%`,
                }}
                title={`${metric.date}: ${metric.uploads} Dokumente hochgeladen`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{overview.dailyMetrics[0]?.date}</span>
          <span>{overview.dailyMetrics.at(-1)?.date}</span>
        </div>
      </section>
    </>
  );
}
