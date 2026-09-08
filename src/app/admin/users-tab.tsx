import { getPlatformOverview } from "@/lib/admin/platform-data";
import {
  ACCOUNT_STATUS_LABELS,
  classifyAccountActivity,
  type AccountActivityStatus,
} from "@/lib/admin/account-status";
import { formatGermanDateTime } from "@/lib/format";

const PAGE_SIZE = 50;

const STATUS_BADGE_CLASSES: Record<AccountActivityStatus, string> = {
  aktiv: "bg-primary/10 text-primary",
  inaktiv: "bg-secondary text-muted-foreground",
  lange_nicht_da: "bg-destructive/10 text-destructive",
};

export async function AdminUsersTab({ page: requestedPage }: { page: number }) {
  // The accounts list does not depend on the metric window; 30 keeps the
  // overview query identical to the Übersicht tab's default.
  const overview = await getPlatformOverview(30);
  const pages = Math.max(1, Math.ceil(overview.accounts.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const visibleAccounts = overview.accounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusCounts: Record<AccountActivityStatus, number> = {
    aktiv: 0,
    inaktiv: 0,
    lange_nicht_da: 0,
  };
  for (const account of overview.accounts) {
    statusCounts[classifyAccountActivity(account)] += 1;
  }

  return (
    <section className="overflow-hidden rounded-ordilo-md border border-border bg-card shadow-card">
      <div className="border-b border-border p-5">
        <h2 className="text-base font-semibold text-foreground">Konten für Support</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {overview.accountsTotal} Konten: {statusCounts.aktiv} aktiv (7 Tage) · {statusCounts.inaktiv} inaktiv (8–30 Tage) · {statusCounts.lange_nicht_da} lange nicht da.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-secondary/70 text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">E-Mail</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Angemeldet</th>
              <th className="px-5 py-3 font-medium">Letzter Login</th>
              <th className="px-5 py-3 font-medium">Letzte Nutzung</th>
              <th className="px-5 py-3 font-medium">Familien</th>
            </tr>
          </thead>
          <tbody>
            {visibleAccounts.map((account) => {
              const status = classifyAccountActivity(account);
              return (
                <tr key={account.id} className="border-t border-border">
                  <td className="px-5 py-3 font-medium text-foreground">{account.email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}>
                      {ACCOUNT_STATUS_LABELS[status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{formatGermanDateTime(account.createdAt)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatGermanDateTime(account.lastSignInAt)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatGermanDateTime(account.lastActivityAt)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{account.familyCount}</td>
                </tr>
              );
            })}
            {visibleAccounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
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
            <a className="text-primary hover:underline" href={`/admin?tab=nutzer&page=${page - 1}`}>
              Zurück
            </a>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Seite {page} von {pages}
          </span>
          {page < pages ? (
            <a className="text-primary hover:underline" href={`/admin?tab=nutzer&page=${page + 1}`}>
              Weiter
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
