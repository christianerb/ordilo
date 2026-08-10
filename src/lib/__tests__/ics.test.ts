import { describe, expect, it } from "vitest";
import { buildFamilyCalendar, type IcsEvent } from "@/lib/ics";

function makeEvent(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Elternabend",
    note: null,
    starts_on: "2026-08-20",
    ends_on: "2026-08-20",
    all_day: true,
    starts_time: null,
    ends_time: null,
    recurrence: "none",
    recurrence_until: null,
    recurrence_exceptions: [],
    location: null,
    created_at: "2026-08-09T10:00:00Z",
    ...overrides,
  };
}

describe("buildFamilyCalendar", () => {
  it("wraps events in a valid VCALENDAR with CRLF endings", () => {
    const ics = buildFamilyCalendar([makeEvent()]);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Ordilo Familienkalender");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain(
      "UID:11111111-2222-3333-4444-555555555555@ordilo",
    );
  });

  it("renders all-day events with an exclusive DTEND", () => {
    const ics = buildFamilyCalendar([
      makeEvent({ starts_on: "2026-08-20", ends_on: "2026-08-21" }),
    ]);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260820");
    expect(ics).toContain("DTEND;VALUE=DATE:20260822");
  });

  it("renders timed events as floating local times", () => {
    const ics = buildFamilyCalendar([
      makeEvent({
        all_day: false,
        starts_time: "16:00:00",
        ends_time: "17:30:00",
      }),
    ]);

    expect(ics).toContain("DTSTART:20260820T160000");
    expect(ics).toContain("DTEND:20260820T173000");
  });

  it("maps biweekly recurrence to FREQ=WEEKLY;INTERVAL=2 with UNTIL and EXDATE", () => {
    const ics = buildFamilyCalendar([
      makeEvent({
        recurrence: "biweekly",
        recurrence_until: "2026-12-31",
        recurrence_exceptions: ["2026-09-03"],
      }),
    ]);

    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231");
    expect(ics).toContain("EXDATE;VALUE=DATE:20260903");
  });

  it("escapes text values and includes location and note", () => {
    const ics = buildFamilyCalendar([
      makeEvent({
        title: "Sommerfest; Kuchen, bitte",
        location: "Turnhalle, Grundschule",
        note: "Erste Zeile\nZweite Zeile",
      }),
    ]);

    expect(ics).toContain("SUMMARY:Sommerfest\\; Kuchen\\, bitte");
    expect(ics).toContain("LOCATION:Turnhalle\\, Grundschule");
    expect(ics).toContain("DESCRIPTION:Erste Zeile\\nZweite Zeile");
  });

  it("folds long lines at 75 octets with space continuations", () => {
    const ics = buildFamilyCalendar([
      makeEvent({ title: "Ä".repeat(120) }),
    ]);
    const encoder = new TextEncoder();

    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("\r\n ");
    // Unfolding restores the full title.
    const unfolded = ics.replaceAll("\r\n ", "");
    expect(unfolded).toContain(`SUMMARY:${"Ä".repeat(120)}`);
  });
});
