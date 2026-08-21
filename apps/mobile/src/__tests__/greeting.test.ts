import { getGreeting, getTimeOfDay } from "../lib/greeting";

function at(hour: number): Date {
  return new Date(2026, 7, 21, hour, 0, 0);
}

describe("getTimeOfDay", () => {
  it("matches the web boundaries from app-shell-shared", () => {
    expect(getTimeOfDay(at(4))).toBe("night");
    expect(getTimeOfDay(at(5))).toBe("morning");
    expect(getTimeOfDay(at(9))).toBe("morning");
    expect(getTimeOfDay(at(10))).toBe("day");
    expect(getTimeOfDay(at(16))).toBe("day");
    expect(getTimeOfDay(at(17))).toBe("evening");
    expect(getTimeOfDay(at(20))).toBe("evening");
    expect(getTimeOfDay(at(21))).toBe("night");
  });
});

describe("getGreeting", () => {
  it("greets in German across the day", () => {
    expect(getGreeting(at(3))).toBe("Gute Nacht");
    expect(getGreeting(at(5))).toBe("Guten Morgen");
    expect(getGreeting(at(10))).toBe("Guten Morgen");
    expect(getGreeting(at(11))).toBe("Guten Tag");
    expect(getGreeting(at(17))).toBe("Guten Tag");
    expect(getGreeting(at(18))).toBe("Guten Abend");
    expect(getGreeting(at(21))).toBe("Guten Abend");
    expect(getGreeting(at(22))).toBe("Gute Nacht");
  });
});
