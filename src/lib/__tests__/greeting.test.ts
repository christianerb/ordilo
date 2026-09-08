import { expect, it } from "vitest";
import { getGreeting } from "../greeting";

it("greets by the local hour of the given date", () => {
  expect(getGreeting(new Date("2026-09-08T07:00:00"))).toBe("Guten Morgen");
  expect(getGreeting(new Date("2026-09-08T13:00:00"))).toBe("Guten Tag");
  expect(getGreeting(new Date("2026-09-08T20:00:00"))).toBe("Guten Abend");
  expect(getGreeting(new Date("2026-09-08T23:30:00"))).toBe("Gute Nacht");
});

it("honours an explicit timezone for server-side rendering", () => {
  // 04:30 UTC is 06:30 in Berlin (summer) — morning there, night in UTC.
  const utcEarly = new Date("2026-09-08T04:30:00Z");
  expect(getGreeting(utcEarly, "Europe/Berlin")).toBe("Guten Morgen");
});
