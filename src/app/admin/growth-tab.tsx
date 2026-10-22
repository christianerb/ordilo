import { getGrowthOverview } from "@/lib/admin/growth-data";
import { ACQUISITION_CHANNEL_LABELS } from "@/lib/analytics/attribution";
import { formatGermanDate } from "@/lib/format";
import { AdminPeriodNav, formatAdminNumber } from "./period-nav";
import { AdminEmptyNote } from "./empty-note";

function formatPercent(rate: number | null): string {
  if (rate === null) return "–";
  return `${Math.round(rate * 100)} %`;
}

function formatShare(part: number, total: number): string {
  return total === 0 ? "–" : `${Math.round((part / total) * 100)} %`;
}

function formatHours(hours: number | null): string {
  if (hours === null) return "Noch keine Daten";
  if (hours < 1) return "unter 1 Std.";
  if (hours < 48) return `${formatAdminNumber(Math.round(hours))} Std.`;
  return `${formatAdminNumber(Math.round(hours / 24))} Tage`;
}

function ReturnCell({ value }: { value: { eligible: number; returned: number; rate: number | null } }) {
  if (value.rate === null) {
    return <span className="text-muted-foreground">noch offen</span>;
  }
  return (
    <span title={`${value.returned} von ${value.eligible}`}>
      {formatPercent(value.rate)}
    </span>
  );
}

export async function AdminGrowthTab({ days }: { days: 7 | 30 | 90 }) {
  const growth = await getGrowthOverview(days);
  const signupCount = growth.funnel[0]?.count ?? 0;

  const metrics = [
    {
      label: `Neue Konten (${days} Tage)`,
      value: formatAdminNumber(growth.signups),
      detail: "Web, App und Einladungen zusammen",
    },
    {
      label: "Aktivierungsquote",
      value: formatPercent(growth.activationRate),
      detail: "Dokument bestätigt und Frage gestellt in 7 Tagen. Ganz neue Konten haben noch Zeit.",
    },
    {
      label: "Zeit bis zum ersten Dokument",
      value: formatHours(growth.medianHoursToFirstConfirm),
      detail: "Median von der Anmeldung bis zum ersten bestätigten Dokument",
    },
    {
      label: "Aktiv in den letzten 7 Tagen",
      value: formatAdminNumber(growth.weeklyActive),
      detail: `${formatAdminNumber(growth.weeklyEngaged)} davon mit echter Nutzung (nicht nur geöffnet)`,
    },
  ];

  const familyMetrics = [
    {
      label: "Zahlende Familien",
      value: formatAdminNumber(growth.payingFamilies),
      detail: `${formatShare(growth.payingFamilies, growth.familiesTotal)} aller Familien · ${formatAdminNumber(growth.trialingFamilies)} im Test`,
    },
    {
      label: "Mail-Weiterleitung genutzt",
      value: formatAdminNumber(growth.forwardingFamilies),
      detail: `${formatShare(growth.forwardingFamilies, growth.familiesTotal)} aller Familien haben schon eine Mail weitergeleitet`,
    },
    {
      label: `Einladungen (${days} Tage)`,
      value: `${formatAdminNumber(growth.invitesCreated)} → ${formatAdminNumber(growth.invitesAccepted)}`,
      detail: "Links erstellt → Personen beigetreten",
    },
  ];

  return (
    <>
      <AdminPeriodNav tab="wachstum" days={days} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Wachstumskennzahlen">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-ordilo-sm border border-border bg-card p-4 shadow-card">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground">Funnel der neuen Konten</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personen, die sich in den letzten {days} Tagen angemeldet haben, und wie weit sie gekommen sind.
        </p>
        {signupCount === 0 ? (
          <AdminEmptyNote>Im Zeitraum hat sich noch niemand angemeldet.</AdminEmptyNote>
        ) : (
          <ol className="mt-4 space-y-3">
            {growth.funnel.map((step) => (
              <li key={step.key}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-foreground">{step.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatAdminNumber(step.count)} · {formatShare(step.count, signupCount)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary/75"
                    style={{ width: `${signupCount === 0 ? 0 : (step.count / signupCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground">Woher die Leute kommen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Erster Kontakt vor der Anmeldung, ohne Cookies erfasst. Konten von vor dem Tracking stehen unter „Unbekannt“.
        </p>
        {growth.channels.length === 0 ? (
          <AdminEmptyNote>Noch keine Anmeldungen im Zeitraum.</AdminEmptyNote>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Kanal</th>
                  <th className="py-2 pr-4 text-right font-medium">Konten</th>
                  <th className="py-2 pr-4 text-right font-medium">Aktiviert</th>
                  <th className="py-2 pr-4 text-right font-medium">Woche 1 zurück</th>
                  <th className="py-2 text-right font-medium">Zahlend</th>
                </tr>
              </thead>
              <tbody>
                {growth.channels.map((row) => (
                  <tr key={row.channel} className="border-t border-border">
                    <td className="py-2 pr-4">{ACQUISITION_CHANNEL_LABELS[row.channel]}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatAdminNumber(row.signups)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatAdminNumber(row.activated)} ({formatShare(row.activated, row.signups)})
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <ReturnCell value={row.week1} />
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatAdminNumber(row.paying)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground">Kohorten: Kommen sie wieder?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Anmeldungen pro Woche. „Woche 1“ heißt: an Tag 7 bis 13 nach der Anmeldung wieder da, „Woche 4“: an Tag 28 bis 34.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Woche ab</th>
                <th className="py-2 pr-4 text-right font-medium">Konten</th>
                <th className="py-2 pr-4 text-right font-medium">Aktiviert</th>
                <th className="py-2 pr-4 text-right font-medium">Woche 1</th>
                <th className="py-2 text-right font-medium">Woche 4</th>
              </tr>
            </thead>
            <tbody>
              {[...growth.cohorts].reverse().map((cohort) => (
                <tr key={cohort.weekStart} className="border-t border-border">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatGermanDate(cohort.weekStart)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatAdminNumber(cohort.signups)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {cohort.signups === 0 ? "–" : formatShare(cohort.activated, cohort.signups)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {cohort.signups === 0 ? "–" : <ReturnCell value={cohort.week1} />}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {cohort.signups === 0 ? "–" : <ReturnCell value={cohort.week4} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Familien-Kennzahlen">
        {familyMetrics.map((metric) => (
          <article key={metric.label} className="rounded-ordilo-sm border border-border bg-card p-4 shadow-card">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
          </article>
        ))}
      </section>
    </>
  );
}
