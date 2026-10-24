import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getGrowthOverview } = vi.hoisted(() => ({ getGrowthOverview: vi.fn() }));
vi.mock("@/lib/admin/growth-data", () => ({ getGrowthOverview }));

import { AdminGrowthTab } from "../growth-tab";

const pending = { eligible: 0, count: 0, rate: null };

function overview(overrides: Record<string, unknown> = {}) {
  return {
    signups: 4,
    funnel: [
      { key: "signup", label: "Konto angelegt", count: 4 },
      { key: "activated", label: "Aktiviert (bestätigt und gefragt in 7 Tagen)", count: 1 },
    ],
    activation: { eligible: 3, count: 1, rate: 1 / 3 },
    medianHoursToFirstConfirm: 3,
    channels: [
      {
        channel: "suche",
        signups: 3,
        activation: { eligible: 2, count: 1, rate: 0.5 },
        paying: 1,
        week1: { eligible: 2, count: 1, rate: 0.5 },
      },
      { channel: "unbekannt", signups: 1, activation: pending, paying: 0, week1: pending },
    ],
    cohorts: [
      { weekStart: "2026-10-12", signups: 0, activation: pending, week1: pending, week4: pending },
      { weekStart: "2026-10-19", signups: 4, activation: pending, week1: pending, week4: pending },
    ],
    weeklyActive: 9,
    weeklyEngaged: 5,
    invitesCreated: 2,
    invitesAccepted: 1,
    familiesTotal: 10,
    payingFamilies: 2,
    trialingFamilies: 1,
    forwardingFamilies: 3,
    returnsTrackedSince: "2026-10-24",
    ...overrides,
  };
}

describe("AdminGrowthTab", () => {
  it("shows activation, channels and cohorts", async () => {
    getGrowthOverview.mockResolvedValue(overview());
    render(await AdminGrowthTab({ days: 30 }));

    expect(getGrowthOverview).toHaveBeenCalledWith(30);
    const activationCard = screen.getAllByText("Richtig losgelegt")[0].closest("article")!;
    expect(within(activationCard).getByText("33 %")).toBeTruthy();
    expect(
      within(activationCard).getByText(/1 von 3 Konten, deren erste 7 Tage im Zeitraum zu Ende gingen/),
    ).toBeTruthy();
    expect(screen.getByText("3 Std.")).toBeTruthy();

    const searchRow = screen.getByText("Suchmaschine").closest("tr")!;
    expect(within(searchRow).getAllByText("50 %")).toHaveLength(2);
    expect(within(searchRow).getAllByTitle("1 von 2")).toHaveLength(2);
    const unknownRow = screen.getByText("Unbekannt (älteres Konto)").closest("tr")!;
    expect(within(unknownRow).getAllByText("noch offen")).toHaveLength(2);

    // Newest cohort first; open windows are labelled, not 0 %.
    const cohortRows = screen.getByText("Woche ab").closest("table")!.querySelectorAll("tbody tr");
    expect(cohortRows[0].textContent).toContain("19.10.2026");
    expect(within(cohortRows[0] as HTMLElement).getAllByText("noch offen")).toHaveLength(3);

    expect(screen.getByText("„App geöffnet“ wird seit dem 24.10.2026 gemessen.")).toBeTruthy();
    expect(screen.getByText(/Mittlerer Wert der 0 neuen Konten/)).toBeTruthy();
    expect(screen.getByText("2 → 1")).toBeTruthy();
    expect(screen.getByText(/20 % aller Familien · 1 im Test/)).toBeTruthy();
  });

  it("explains a rate that has no old-enough accounts yet", async () => {
    getGrowthOverview.mockResolvedValue(overview({ activation: pending }));
    render(await AdminGrowthTab({ days: 7 }));
    expect(
      screen.getByText("Im Zeitraum hat noch kein Konto seine ersten 7 Tage hinter sich."),
    ).toBeTruthy();
  });

  it("shows a calm empty state without signups", async () => {
    getGrowthOverview.mockResolvedValue(
      overview({
        signups: 0,
        funnel: [{ key: "signup", label: "Konto angelegt", count: 0 }],
        activation: pending,
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
