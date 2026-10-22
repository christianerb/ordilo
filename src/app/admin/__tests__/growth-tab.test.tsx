import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getGrowthOverview } = vi.hoisted(() => ({ getGrowthOverview: vi.fn() }));
vi.mock("@/lib/admin/growth-data", () => ({ getGrowthOverview }));

import { AdminGrowthTab } from "../growth-tab";

const pending = { eligible: 0, returned: 0, rate: null };

function overview(overrides: Record<string, unknown> = {}) {
  return {
    signups: 4,
    funnel: [
      { key: "signup", label: "Konto angelegt", count: 4 },
      { key: "activated", label: "Aktiviert (bestätigt und gefragt in 7 Tagen)", count: 1 },
    ],
    activationRate: 0.25,
    medianHoursToFirstConfirm: 3,
    channels: [
      { channel: "suche", signups: 3, activated: 1, paying: 1, week1: { eligible: 2, returned: 1, rate: 0.5 } },
      { channel: "unbekannt", signups: 1, activated: 0, paying: 0, week1: pending },
    ],
    cohorts: [
      { weekStart: "2026-10-12", signups: 0, activated: 0, week1: pending, week4: pending },
      { weekStart: "2026-10-19", signups: 4, activated: 1, week1: pending, week4: pending },
    ],
    weeklyActive: 9,
    weeklyEngaged: 5,
    invitesCreated: 2,
    invitesAccepted: 1,
    familiesTotal: 10,
    payingFamilies: 2,
    trialingFamilies: 1,
    forwardingFamilies: 3,
    ...overrides,
  };
}

describe("AdminGrowthTab", () => {
  it("shows activation, channels and cohorts", async () => {
    getGrowthOverview.mockResolvedValue(overview());
    render(await AdminGrowthTab({ days: 30 }));

    expect(getGrowthOverview).toHaveBeenCalledWith(30);
    expect(screen.getByText("Aktivierungsquote").nextSibling?.textContent).toBe("25 %");
    expect(screen.getByText("3 Std.")).toBeTruthy();

    const searchRow = screen.getByText("Suchmaschine").closest("tr")!;
    expect(within(searchRow).getByText("1 (33 %)")).toBeTruthy();
    expect(within(searchRow).getByText("50 %")).toBeTruthy();
    expect(screen.getByText("Unbekannt (vor dem Tracking)")).toBeTruthy();

    // Newest cohort first; open return windows are labelled, not 0 %.
    const cohortRows = screen.getByText("Woche ab").closest("table")!.querySelectorAll("tbody tr");
    expect(cohortRows[0].textContent).toContain("19.10.2026");
    expect(within(cohortRows[0] as HTMLElement).getAllByText("noch offen")).toHaveLength(2);

    expect(screen.getByText("2 → 1")).toBeTruthy();
    expect(screen.getByText(/20 % aller Familien · 1 im Test/)).toBeTruthy();
  });

  it("shows a calm empty state without signups", async () => {
    getGrowthOverview.mockResolvedValue(
      overview({
        signups: 0,
        funnel: [{ key: "signup", label: "Konto angelegt", count: 0 }],
        activationRate: null,
        medianHoursToFirstConfirm: null,
        channels: [],
      }),
    );
    render(await AdminGrowthTab({ days: 7 }));
    expect(screen.getByText("Im Zeitraum hat sich noch niemand angemeldet.")).toBeTruthy();
    expect(screen.getByText("Noch keine Anmeldungen im Zeitraum.")).toBeTruthy();
    expect(screen.getByText("Noch keine Daten")).toBeTruthy();
  });
});
