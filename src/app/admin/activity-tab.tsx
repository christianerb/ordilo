import { getBetaOverview } from "@/lib/admin/beta-data";
import { getRecentActivity } from "@/lib/admin/activity-data";
import { describeActivityEvent } from "@/lib/admin/activity-labels";
import { listAccountEmailMap } from "@/lib/admin/platform-data";
import { formatGermanDateTime, formatRelativeTime } from "@/lib/format";
import { AdminPeriodNav } from "./period-nav";

const FAILURE_STAGE_LABELS: Record<string, string> = {
  upload: "Upload",
  ocr: "Texterkennung",
  analyze: "Analyse",
  embed: "Suchindex",
};

export async function AdminActivityTab({ days }: { days: 7 | 30 | 90 }) {
  const [beta, activity, accountEmails] = await Promise.all([
    getBetaOverview(days),
    getRecentActivity(),
    listAccountEmailMap(),
  ]);

  const betaMetrics: Array<[string, string | number]> = [
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
  ];

  return (
    <>
      <AdminPeriodNav tab="aktivitaet" days={days} />

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-semibold">Letzte Aktivität</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Die neuesten Produkt-Ereignisse über alle Konten, ohne Dokumentinhalte oder Suchbegriffe.
        </p>
        {activity.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Zeitpunkt</th>
                  <th className="py-2 pr-4 font-medium">Nutzer</th>
                  <th className="py-2 font-medium">Ereignis</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((event) => (
                  <tr key={event.id} className="border-t border-border">
                    <td
                      className="py-2 pr-4 whitespace-nowrap text-muted-foreground"
                      title={formatGermanDateTime(event.occurredAt)}
                    >
                      {formatRelativeTime(event.occurredAt) ?? event.occurredAt}
                    </td>
                    <td className="py-2 pr-4">{accountEmails.get(event.userId) ?? event.userId}</td>
                    <td className="py-2">{describeActivityEvent(event.eventName, event.properties)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Noch keine Ereignisse erfasst.</p>
        )}
      </section>

      <section className="rounded-ordilo-md border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-semibold">Beta: vom Einstieg zur Nutzung</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Letzte {days} Tage, Tagesgrenzen in UTC. Einstiegskohorte: Personen mit Onboarding-Start im Zeitraum; spätere Abschlüsse und erste Uploads derselben Personen. Ein Login allein zählt hier nicht als Produktaktivität.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {betaMetrics.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          Fehler nach Verarbeitungsschritt: {beta.failureStages.map(({ stage, count }) => `${FAILURE_STAGE_LABELS[stage] ?? stage} ${count}`).join(" · ")}. Noch nicht hochgeladene lokale Dateien sind hier nicht sichtbar.
        </p>
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium">Wo stehen die neuen Nutzer?</summary>
          <p className="mt-2 text-sm text-muted-foreground">Letzter belegter Einstiegsschritt; kein automatisch behaupteter Abbruch.</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr><th>Nutzer</th><th>Letzter Schritt</th><th>Zeitpunkt</th></tr>
            </thead>
            <tbody>
              {beta.lastSteps.map((row) => (
                <tr key={row.userId}>
                  <td className="py-2">{accountEmails.get(row.userId) ?? row.userId}</td>
                  <td>{row.step}</td>
                  <td>{formatGermanDateTime(row.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium">Täglich aktive Personen (Produktnutzung)</summary>
          {beta.daily.length ? (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr><th>Tag (UTC)</th><th>Personen</th></tr>
              </thead>
              <tbody>
                {beta.daily.map(({ day, users }) => (
                  <tr key={day}><td className="py-1">{day}</td><td>{users}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Noch keine Produktaktivität erfasst.</p>
          )}
        </details>
      </section>
    </>
  );
}
