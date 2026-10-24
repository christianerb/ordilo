import { describe, expect, it } from "vitest";
import {
  berlinDay,
  nextBerlinMidnight,
  startOfBerlinDay,
  startOfBerlinDayBefore,
  startOfBerlinWeek,
} from "../berlin-date";

const iso = (time: number) => new Date(time).toISOString();

describe("berlinDay", () => {
  it("uses the German calendar day", () => {
    expect(berlinDay(new Date("2026-10-22T21:59:00Z"))).toBe("2026-10-22");
    expect(berlinDay(new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
    expect(berlinDay(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
  });
});

describe("startOfBerlinDay", () => {
  it("returns Berlin midnight in summer and winter time", () => {
    expect(iso(startOfBerlinDay(Date.parse("2026-07-15T12:00:00Z")))).toBe("2026-07-14T22:00:00.000Z");
    expect(iso(startOfBerlinDay(Date.parse("2026-01-15T12:00:00Z")))).toBe("2026-01-14T23:00:00.000Z");
    // 23:30 UTC on Jan 15 is already Jan 16 in Berlin.
    expect(iso(startOfBerlinDay(Date.parse("2026-01-15T23:30:00Z")))).toBe("2026-01-15T23:00:00.000Z");
  });

  it("handles the DST switch days", () => {
    // 2026-03-29: clocks jump forward at 02:00, midnight is still CET.
    expect(iso(startOfBerlinDay(Date.parse("2026-03-29T12:00:00Z")))).toBe("2026-03-28T23:00:00.000Z");
    // 2026-10-25: clocks fall back at 03:00, midnight is still CEST.
    expect(iso(startOfBerlinDay(Date.parse("2026-10-25T12:00:00Z")))).toBe("2026-10-24T22:00:00.000Z");
  });
});

describe("startOfBerlinWeek", () => {
  it("returns Monday 00:00 Berlin time", () => {
    // Wednesday 2026-10-21
    expect(iso(startOfBerlinWeek(Date.parse("2026-10-21T12:00:00Z")))).toBe("2026-10-18T22:00:00.000Z");
    // Monday 00:30 Berlin (Sunday 22:30 UTC) belongs to the new week.
    expect(iso(startOfBerlinWeek(Date.parse("2026-10-18T22:30:00Z")))).toBe("2026-10-18T22:00:00.000Z");
    // Sunday 23:59 Berlin still belongs to the old week.
    expect(iso(startOfBerlinWeek(Date.parse("2026-10-18T21:59:00Z")))).toBe("2026-10-11T22:00:00.000Z");
  });

  it("crosses a DST change inside the week", () => {
    // Wednesday 2026-10-28 (CET); its Monday 2026-10-26 starts at 23:00 UTC.
    expect(iso(startOfBerlinWeek(Date.parse("2026-10-28T12:00:00Z")))).toBe("2026-10-25T23:00:00.000Z");
    // Sunday 2026-10-25 (switch day) belongs to the week of Monday 2026-10-19 (CEST).
    expect(iso(startOfBerlinWeek(Date.parse("2026-10-25T12:00:00Z")))).toBe("2026-10-18T22:00:00.000Z");
  });
});

describe("nextBerlinMidnight", () => {
  it("returns the coming Berlin midnight, also across a DST change", () => {
    expect(iso(nextBerlinMidnight(Date.parse("2026-10-22T08:00:00Z")))).toBe("2026-10-22T22:00:00.000Z");
    // Saturday before the switch: next midnight is still CEST.
    expect(iso(nextBerlinMidnight(Date.parse("2026-10-24T08:00:00Z")))).toBe("2026-10-24T22:00:00.000Z");
    // Switch day itself: the following midnight is CET.
    expect(iso(nextBerlinMidnight(Date.parse("2026-10-25T08:00:00Z")))).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("module load", () => {
  it("does not use offset-name formatting that older Safari rejects", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/lib/berlin-date.ts"), "utf8");
    expect(source).not.toMatch(/timeZoneName\s*:/);
  });
});

describe("startOfBerlinDayBefore", () => {
  it("counts calendar days back from today, across a DST change", () => {
    const now = Date.parse("2026-10-26T23:30:00Z"); // Tue 27.10. 00:30 Berlin (CET)
    expect(iso(startOfBerlinDayBefore(now, 0))).toBe("2026-10-26T23:00:00.000Z");
    // Two days back is Sun 25.10., the switch day, which starts in CEST.
    expect(iso(startOfBerlinDayBefore(now, 2))).toBe("2026-10-24T22:00:00.000Z");
  });
});
