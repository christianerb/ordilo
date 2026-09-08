import { getUsageOverview } from "@/lib/admin/usage-data";
import { listAccountEmailMap } from "@/lib/admin/platform-data";
import { formatAdminNumber } from "./period-nav";
import { AdminEmptyNote } from "./empty-note";

const OPERATION_LABELS: Record<string, string> = {
  document_total: "Dokument (OCR, Analyse, Embeddings)",
  chat: "Chatfrage",
  search: "Suchanfrage",
  voice_transcription: "Spracheingabe",
  browser_voice: "Browser-Sprachsitzung (Verbrauch offen)",
  email_analysis: "E-Mail-Analyse",
};

const usdFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

function monthKey(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    .toISOString()
    .slice(0, 7);
}

function formatMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export async function AdminCostsTab() {
  const [usage, accountEmails] = await Promise.all([
    getUsageOverview(),
    listAccountEmailMap(),
  ]);

  if (!usage.available) {
    return (
      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-semibold">API-Verbrauch und variable Kosten</h2>
        <p className="mt-3">Verbrauchsdaten nicht verfügbar. Migration 0079 und Datenbankzugriff prüfen.</p>
      </section>
    );
  }

  const currentMonth = usage.monthly.find((entry) => entry.month === monthKey(0));
  const previousMonth = usage.monthly.find((entry) => entry.month === monthKey(1));

  const summaryCards = [
    {
      label: `Bekannte Kosten ${formatMonthLabel(monthKey(0))}`,
      value: formatUsd(currentMonth?.knownUsd ?? 0),
    },
    {
      label: `Bekannte Kosten ${formatMonthLabel(monthKey(1))}`,
      value: formatUsd(previousMonth?.knownUsd ?? 0),
    },
    { label: "Bekannte Kosten gesamt", value: formatUsd(usage.totals.knownUsd) },
    { label: "Aufrufe ohne Preis", value: formatAdminNumber(usage.totals.unknownCosts) },
  ];

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Kostenübersicht">
        {summaryCards.map((card) => (
          <article key={card.label} className="rounded-ordilo-sm border border-border bg-card p-4 shadow-card">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-x-auto rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-semibold">API-Verbrauch und variable Kosten</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          USD-Schätzung ohne Fixkosten, maximal 12 Monate; ersetzt keine Anbieterrechnung. Browser-Sprachsitzungen fehlen noch in der Bepreisung.
        </p>

        <h3 className="mt-6 text-base font-semibold">Verlauf nach Monat</h3>
        {usage.monthly.length > 1 && (
          <div className="mt-4">
            <div
              className="grid h-32 items-end gap-2"
              style={{ gridTemplateColumns: `repeat(${usage.monthly.length}, minmax(0, 1fr))` }}
            >
              {[...usage.monthly].reverse().map((entry, index) => (
                <div key={entry.month} className="flex h-full min-w-0 flex-col justify-end">
                  <div
                    className="animate-bar-grow-in rounded-t bg-primary/60"
                    style={{
                      height: entry.knownUsd > 0
                        ? `${Math.max(4, (entry.knownUsd / Math.max(0.0001, ...usage.monthly.map((month) => month.knownUsd))) * 100)}%`
                        : "0%",
                      "--bar-delay": `${index * 40}ms`,
                    } as React.CSSProperties}
                    title={`${formatMonthLabel(entry.month)}: ${formatUsd(entry.knownUsd)}, ${entry.calls} Aufrufe`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{formatMonthLabel(usage.monthly.at(-1)?.month ?? "")}</span>
              <span>{formatMonthLabel(usage.monthly[0]?.month ?? "")}</span>
            </div>
          </div>
        )}
        {!usage.monthly.length && (
          <AdminEmptyNote>
            Noch kein API-Verbrauch erfasst. Frühere Kosten werden nicht rückwirkend geschätzt.
          </AdminEmptyNote>
        )}

        <h3 className="mt-6 text-base font-semibold">Verbrauch je Nutzer und Monat</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr><th>Nutzer</th><th>Monat (UTC)</th><th>API-Aufrufe</th><th>Erfasste Tokens</th><th>Bekannte Kosten (USD)</th><th>Aufrufe ohne Preis</th></tr>
          </thead>
          <tbody>
            {usage.accounts.map((row) => (
              <tr key={`${row.userId}:${row.month}`}>
                <td className="py-2">{row.userId ? accountEmails.get(row.userId) ?? row.userId : "Nicht zugeordnet"}</td>
                <td>{row.month === "gesamt" ? "Gesamt" : formatMonthLabel(row.month)}</td>
                <td>{row.calls}</td>
                <td>{formatAdminNumber(row.tokens)}</td>
                <td>{formatUsd(row.knownUsd)}</td>
                <td>{row.unknownCosts}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!usage.accounts.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            Noch kein API-Verbrauch erfasst. Frühere Kosten werden nicht rückwirkend geschätzt.
          </p>
        )}

        <h3 className="mt-6 text-base font-semibold">Kosten je Vorgang</h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr><th>Vorgang</th><th>Dokumente / Anfragen</th><th>API-Aufrufe</th><th>Ø bekannte vollständige Kosten (USD)</th></tr>
          </thead>
          <tbody>
            {usage.operations.map((row) => (
              <tr key={row.operation}>
                <td className="py-2">{OPERATION_LABELS[row.operation] ?? row.operation}</td>
                <td>{row.units}</td>
                <td>{row.calls}</td>
                <td>{row.averageUsd === null ? "Unvollständig" : formatUsd(row.averageUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
