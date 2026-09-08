import { getPlatformOverview } from "@/lib/admin/platform-data";
import { getHappinessOverview } from "@/lib/admin/happiness-data";
import {
  summarizeRetention,
  summarizeStickiness,
} from "@/lib/admin/account-status";
import { formatGermanDateTime, formatRelativeTime } from "@/lib/format";
import { AdminPeriodNav, formatAdminNumber } from "./period-nav";

function formatPercent(rate: number | null): string {
  if (rate === null) return "Noch keine Daten";
  return `${Math.round(rate * 100)} %`;
}

type DailyMetric = { date: string; registrations: number; activeAccounts: number; uploads: number };

function DailyBars({
  label,
  hint,
  metrics,
  value,
  max,
  barClass,
  title,
}: {
  label: string;
  hint: string;
  metrics: DailyMetric[];
  value: (metric: DailyMetric) => number;
  max: number;
  barClass: string;
  title: (metric: DailyMetric) => string;
}) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 grid h-24 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1">
        {metrics.map((metric, index) => (
          <div key={metric.date} className="flex h-full min-w-0 flex-col justify-end">
            <div
              className={`animate-bar-grow-in rounded-t ${barClass}`}
              style={{
                height: `${Math.max(4, (value(metric) / max) * 100)}%`,
                "--bar-delay": `${index * 8}ms`,
              } as React.CSSProperties}
              title={title(metric)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export async function AdminOverviewTab({ days }: { days: 7 | 30 | 90 }) {
  const [overview, happiness] = await Promise.all([
    getPlatformOverview(days),
    getHappinessOverview(),
  ]);

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
  const totalsByDate = new Map(
    overview.dailyMetrics.map((metric) => {
      runningTotal += metric.registrations;
      return [metric.date, runningTotal];
    }),
  );

  const metrics = [
    {
      label: "Konten gesamt",
      value: formatAdminNumber(overview.accountsTotal),
      detail: `${formatAdminNumber(overview.accountsNew)} neu in ${days} Tagen`,
    },
    {
      label: `Aktive Konten (${days} Tage)`,
      value: formatAdminNumber(overview.accountsActive),
      detail: "Login oder Nutzung im Zeitraum",
    },
    {
      label: "Familien",
      value: formatAdminNumber(overview.familiesTotal),
      detail: `Ø ${formatAdminNumber(overview.averageAccountsPerFamily)} Konten · ${formatAdminNumber(overview.averageMembersPerFamily)} Mitglieder`,
    },
    {
      label: "Dokumente gesamt",
      value: formatAdminNumber(overview.documentsTotal),
      detail: "Scans, Fotos und Dateien zusammen",
    },
  ];

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
      detail:
        happiness.failedDocuments.total === 0
          ? "Alles sauber verarbeitet."
          : `${happiness.failedDocuments.last30Days} davon in den letzten 30 Tagen`,
    },
  ];

  const charts = [
    {
      label: "Aktive Konten",
      hint: "Konten mit Login oder Nutzung am Tag",
      value: (metric: DailyMetric) => metric.activeAccounts,
      max: Math.max(1, ...overview.dailyMetrics.map((metric) => metric.activeAccounts)),
      barClass: "bg-primary/75",
      title: (metric: DailyMetric) => `${metric.date}: ${metric.activeAccounts} aktiv`,
    },
    {
      label: "Neue Anmeldungen",
      hint: "Registrierungen am Tag, Tooltip zeigt den kumulierten Stand",
      value: (metric: DailyMetric) => metric.registrations,
      max: Math.max(1, ...overview.dailyMetrics.map((metric) => metric.registrations)),
      barClass: "bg-primary/60",
      title: (metric: DailyMetric) =>
        `${metric.date}: ${metric.registrations} neu, ${totalsByDate.get(metric.date)} Konten insgesamt`,
    },
    {
      label: "Scans",
      hint: "Hochgeladene Dokumente am Tag; Scans, Fotos und Dateien zählen gleich",
      value: (metric: DailyMetric) => metric.uploads,
      max: Math.max(1, ...overview.dailyMetrics.map((metric) => metric.uploads)),
      barClass: "bg-primary/45",
      title: (metric: DailyMetric) => `${metric.date}: ${metric.uploads} Dokumente hochgeladen`,
    },
  ];

  return (
    <>
      <AdminPeriodNav tab="uebersicht" days={days} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-ordilo-sm border border-border bg-card p-4 shadow-card">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground">Letzte 30 Tage</h2>
        <div className="mt-4 space-y-4">
          {charts.map((chart) => (
            <DailyBars
              key={chart.label}
              label={chart.label}
              hint={chart.hint}
              metrics={overview.dailyMetrics}
              value={chart.value}
              max={chart.max}
              barClass={chart.barClass}
              title={chart.title}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{overview.dailyMetrics[0]?.date}</span>
          <span>{overview.dailyMetrics.at(-1)?.date}</span>
        </div>
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground">Gesundheit und Zufriedenheit</h2>
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
            <summary className="focus-ring cursor-pointer rounded-sm text-sm font-medium">Neueste Feedback-Kommentare</summary>
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
    </>
  );
}
