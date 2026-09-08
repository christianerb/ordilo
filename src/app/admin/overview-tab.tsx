import { getPlatformOverview } from "@/lib/admin/platform-data";
import {
  ACCOUNT_STATUS_LABELS,
  classifyAccountActivity,
  type AccountActivityStatus,
} from "@/lib/admin/account-status";
import { AdminPeriodNav, formatAdminNumber } from "./period-nav";

const STATUS_ORDER: AccountActivityStatus[] = ["aktiv", "inaktiv", "lange_nicht_da"];

export async function AdminOverviewTab({ days }: { days: 7 | 30 | 90 }) {
  const overview = await getPlatformOverview(days);
  const maxDailyActivity = Math.max(
    1,
    ...overview.dailyMetrics.map((metric) => metric.activeAccounts),
  );
  const maxDailyUploads = Math.max(
    1,
    ...overview.dailyMetrics.map((metric) => metric.uploads),
  );

  const statusCounts: Record<AccountActivityStatus, number> = {
    aktiv: 0,
    inaktiv: 0,
    lange_nicht_da: 0,
  };
  for (const account of overview.accounts) {
    statusCounts[classifyAccountActivity(account)] += 1;
  }

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
