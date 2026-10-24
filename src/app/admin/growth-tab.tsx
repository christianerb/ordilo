import { getGrowthOverview } from "@/lib/admin/growth-data";
import { ACTIVATION_WINDOW_DAYS, type Share } from "@/lib/admin/growth-metrics";
import { ACQUISITION_CHANNEL_LABELS } from "@/lib/analytics/attribution";
import { formatGermanDate } from "@/lib/format";
import { AdminPeriodNav, formatAdminNumber, formatAdminPercent } from "./period-nav";
import { AdminMetricCard } from "@/components/ordilo/admin-metric-card";
import { AdminEmptyNote } from "./empty-note";

const NO_DATA = "–";

function formatShare(part: number, total: number): string {
  return formatAdminPercent(total === 0 ? null : part / total, NO_DATA);
}

function formatHours(hours: number | null): string {
  if (hours === null) return "Noch keine Daten";
  if (hours < 1) return "unter 1 Std.";
  if (hours < 48) return `${formatAdminNumber(Math.round(hours))} Std.`;
  return `${formatAdminNumber(Math.round(hours / 24))} Tage`;
}

/** A share that only counts accounts whose window has passed. */
function ShareCell({ value }: { value: Share }) {
  if (value.rate === null) {
    return <span className="text-muted-foreground">noch offen</span>;
  }
  return (
    <span title={`${value.count} von ${value.eligible}`}>
      {formatAdminPercent(value.rate, NO_DATA)}
    </span>
  );
}

export async function AdminGrowthTab({ days }: { days: 7 | 30 | 90 }) {
  const growth = await getGrowthOverview(days);
  const confirmedCount = growth.funnel.find((step) => step.key === "confirm")?.count ?? 0;

  const metrics = [
    {
      label: `Neue Konten (${days} Tage)`,
      value: formatAdminNumber(growth.signups),
      detail: "Web, App und Einladungen zusammen",
    },
    {
      label: "Richtig losgelegt",
      value: formatAdminPercent(growth.activation.rate, NO_DATA),
      detail:
        growth.activation.eligible === 0
          ? `Im Zeitraum hat noch kein Konto seine ersten ${ACTIVATION_WINDOW_DAYS} Tage hinter sich.`
          : `In ${ACTIVATION_WINDOW_DAYS} Tagen ein Dokument bestätigt und eine Frage gestellt: ${growth.activation.count} von ${growth.activation.eligible} Konten, deren erste ${ACTIVATION_WINDOW_DAYS} Tage im Zeitraum zu Ende gingen`,
    },
    {
      label: "Zeit bis zum ersten Dokument",
      value: formatHours(growth.medianHoursToFirstConfirm),
      detail: `Mittlerer Wert der ${formatAdminNumber(confirmedCount)} neuen Konten, die schon ein Dokument bestätigt haben`,
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
          <AdminMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-foreground">Wie weit neue Konten kommen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personen, die sich in den letzten {days} Tagen angemeldet haben, und wie weit sie bisher gekommen sind. Ganz neue Konten können noch aufholen.
        </p>
        {growth.signups === 0 ? (
          <AdminEmptyNote>Im Zeitraum hat sich noch niemand angemeldet.</AdminEmptyNote>
        ) : (
          <ol className="mt-4 space-y-3">
            {growth.funnel.map((step) => (
              <li key={step.key}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-foreground">{step.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatAdminNumber(step.count)} · {formatShare(step.count, growth.signups)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary/75"
                    style={{ width: `${(step.count / growth.signups) * 100}%` }}
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
          Der erste Kontakt vor der Anmeldung, ohne Cookies gemessen. Konten von vor dieser Messung stehen unter „Unbekannt“. „Konten“ und „Zahlend“ zählen Anmeldungen im Zeitraum; die Quoten zählen Konten, deren erste 7 bzw. 14 Tage im Zeitraum zu Ende gingen.
        </p>
        {growth.channels.length === 0 ? (
          <AdminEmptyNote>Noch keine Anmeldungen im Zeitraum.</AdminEmptyNote>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Weg zu Ordilo</th>
                  <th className="py-2 pr-4 text-right font-medium">Konten</th>
                  <th className="py-2 pr-4 text-right font-medium">Richtig losgelegt</th>
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
                      <ShareCell value={row.activation} />
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <ShareCell value={row.week1} />
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
        <h2 className="text-base font-semibold text-foreground">Kommen neue Konten wieder?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Anmeldungen pro Woche. „Woche 1“ heißt: an Tag 7 bis 13 nach der Anmeldung wieder da, „Woche 4“: an Tag 28 bis 34. „Noch offen“ heißt: Die Zeit ist noch nicht um oder lag vor dem Start der Messung.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {growth.returnsTrackedSince
            ? `„App geöffnet“ wird seit dem ${formatGermanDate(growth.returnsTrackedSince)} gemessen.`
            : "„App geöffnet“ wurde noch nicht gemessen."}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Woche ab</th>
                <th className="py-2 pr-4 text-right font-medium">Konten</th>
                <th className="py-2 pr-4 text-right font-medium">Richtig losgelegt</th>
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
                    {cohort.signups === 0 ? NO_DATA : <ShareCell value={cohort.activation} />}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {cohort.signups === 0 ? NO_DATA : <ShareCell value={cohort.week1} />}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {cohort.signups === 0 ? NO_DATA : <ShareCell value={cohort.week4} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Familien-Kennzahlen">
        {familyMetrics.map((metric) => (
          <AdminMetricCard key={metric.label} {...metric} />
        ))}
      </section>
    </>
  );
}
