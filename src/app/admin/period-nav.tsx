const PERIOD_OPTIONS = [7, 30, 90] as const;

export function formatAdminNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
}

/**
 * Zeitraum-Auswahl für Admin-Tabs. Links behalten den aktiven Tab.
 */
export function AdminPeriodNav({ tab, days }: { tab: string; days: number }) {
  return (
    <nav className="flex gap-2" aria-label="Zeitraum auswählen">
      {PERIOD_OPTIONS.map((option) => (
        <a
          key={option}
          href={`/admin?tab=${tab}&days=${option}`}
          className={
            days === option
              ? "focus-ring rounded-ordilo-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              : "focus-ring rounded-ordilo-sm border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
          }
        >
          {option} Tage
        </a>
      ))}
    </nav>
  );
}
