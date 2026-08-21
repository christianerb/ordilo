import { describe, expect, it } from "vitest";
import {
  findCalendarCandidates,
  isAppointmentLike,
  isDeadlineLike,
  selectedCalendarEvents,
} from "@/lib/calendar-heuristics";

const TODAY = "2026-08-21";

function entry(date: string, label: string) {
  return { date, label };
}

describe("isDeadlineLike", () => {
  it.each([
    "Zahlungsfrist",
    "Kündigungsfrist",
    "Fällig am",
    "Gültig bis",
    "Anmeldefrist",
    "Mahnung fällig",
    "Widerspruchsfrist",
  ])("treats %s as a deadline", (label) => {
    expect(isDeadlineLike(label)).toBe(true);
  });

  it.each(["Elternabend", "Abflug", "Arzttermin"])(
    "does not treat %s as a deadline",
    (label) => {
      expect(isDeadlineLike(label)).toBe(false);
    },
  );
});

describe("isAppointmentLike", () => {
  it.each(["Elternabend", "Abflug Mallorca", "Arzttermin", "Geburtstag"])(
    "treats %s as an appointment",
    (label) => {
      expect(isAppointmentLike(label)).toBe(true);
    },
  );

  it("lets the deadline word win over an appointment word", () => {
    const label = "Anmeldefrist für den Ausflug";
    expect(isAppointmentLike(label)).toBe(true);
    expect(isDeadlineLike(label)).toBe(true);
  });
});

describe("findCalendarCandidates", () => {
  it("offers future dates and skips past ones", () => {
    const candidates = findCalendarCandidates(
      [entry("2026-09-01", "Einschulung"), entry("2026-08-01", "Gezahlt am")],
      TODAY,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      index: 0,
      date: "2026-09-01",
      label: "Einschulung",
    });
  });

  it("offers a date that is today", () => {
    const candidates = findCalendarCandidates(
      [entry(TODAY, "Abholung Kita")],
      TODAY,
    );
    expect(candidates).toHaveLength(1);
  });

  it("skips pure times and non-ISO values", () => {
    const candidates = findCalendarCandidates(
      [entry("19:25", "Abflug geplant"), entry("Montag", "Termin")],
      TODAY,
    );
    expect(candidates).toHaveLength(0);
  });

  it("pre-checks appointments and unchecks deadlines", () => {
    const candidates = findCalendarCandidates(
      [entry("2026-09-01", "Elternabend"), entry("2026-09-05", "Zahlungsfrist")],
      TODAY,
    );
    expect(candidates[0].defaultSelected).toBe(true);
    expect(candidates[1].defaultSelected).toBe(false);
  });

  it("defaults unknown future dates to selected", () => {
    const candidates = findCalendarCandidates(
      [entry("2026-09-01", "Sommerfest")],
      TODAY,
    );
    expect(candidates[0].defaultSelected).toBe(true);
  });

  it("keeps the original array index", () => {
    const candidates = findCalendarCandidates(
      [entry("2026-08-01", "Gezahlt am"), entry("2026-09-01", "Elternabend")],
      TODAY,
    );
    expect(candidates[0].index).toBe(1);
  });
});

describe("selectedCalendarEvents", () => {
  it("returns default-selected candidates without overrides", () => {
    const candidates = findCalendarCandidates(
      [entry("2026-09-01", "Elternabend"), entry("2026-09-05", "Zahlungsfrist")],
      TODAY,
    );
    expect(selectedCalendarEvents(candidates, new Map())).toEqual([
      { date: "2026-09-01", label: "Elternabend" },
    ]);
  });

  it("honours user overrides in both directions", () => {
    const candidates = findCalendarCandidates(
      [entry("2026-09-01", "Elternabend"), entry("2026-09-05", "Zahlungsfrist")],
      TODAY,
    );
    const overrides = new Map<number, boolean>([
      [0, false],
      [1, true],
    ]);
    expect(selectedCalendarEvents(candidates, overrides)).toEqual([
      { date: "2026-09-05", label: "Zahlungsfrist" },
    ]);
  });
});
