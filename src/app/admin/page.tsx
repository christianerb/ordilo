import { redirect } from "next/navigation";
import { getCodeEligibleAdmin, getVerifiedAdmin } from "@/lib/admin/access";
import { getGreeting } from "@/lib/greeting";
import { OrdiloMark } from "@/components/ordilo/ordilo-mark";
import { AdminLogoutButton } from "./admin-logout-button";
import { AdminOverviewTab } from "./overview-tab";
import { AdminUsersTab } from "./users-tab";
import { AdminActivityTab } from "./activity-tab";
import { AdminCostsTab } from "./costs-tab";

export const metadata = {
  title: "Plattformübersicht | Ordilo",
  robots: { index: false, follow: false },
};

const TABS = [
  { key: "uebersicht", label: "Übersicht" },
  { key: "nutzer", label: "Nutzer" },
  { key: "aktivitaet", label: "Aktivität" },
  { key: "kosten", label: "Kosten" },
] as const;

type AdminTab = (typeof TABS)[number]["key"];

function parseTab(value: string | string[] | undefined): AdminTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return TABS.some((tab) => tab.key === raw) ? (raw as AdminTab) : "uebersicht";
}

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

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getCodeEligibleAdmin())) redirect("/login");
  if (!(await getVerifiedAdmin())) redirect("/admin/access");

  const params = await searchParams;
  const tab = parseTab(params.tab);
  const days = parseDays(params.days);
  const page = parsePage(params.page);

  return (
    <main className="min-h-dvh bg-[var(--canvas-warm)] p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-ordilo-md border border-border bg-card p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <OrdiloMark size={36} animate={false} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Plattformübersicht
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {getGreeting(new Date(), "Europe/Berlin")}. Interner Bereich:
                Nutzungsdaten ohne Dokumentinhalte oder Suchbegriffe.
              </p>
            </div>
          </div>
          <AdminLogoutButton />
        </header>

        <nav
          aria-label="Admin-Bereiche"
          className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 shadow-card"
        >
          {TABS.map((item) => (
            <a
              key={item.key}
              href={`/admin?tab=${item.key}`}
              aria-current={tab === item.key ? "page" : undefined}
              className={
                tab === item.key
                  ? "focus-ring rounded-full bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground"
                  : "focus-ring rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground"
              }
            >
              {item.label}
            </a>
          ))}
        </nav>

        {tab === "uebersicht" && <AdminOverviewTab days={days} />}
        {tab === "nutzer" && <AdminUsersTab page={page} />}
        {tab === "aktivitaet" && <AdminActivityTab days={days} />}
        {tab === "kosten" && <AdminCostsTab />}
      </div>
    </main>
  );
}
