import { expect, it } from "vitest";
import {
  classifyAccountActivity,
  summarizeRetention,
  summarizeStickiness,
} from "../account-status";

const NOW = new Date("2026-09-08T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

it("marks recent use as aktiv", () => {
  expect(classifyAccountActivity({ lastActivityAt: daysAgo(2) }, NOW)).toBe("aktiv");
  expect(classifyAccountActivity({ lastSignInAt: daysAgo(7) }, NOW)).toBe("aktiv");
});

it("marks use 8 to 30 days ago as inaktiv", () => {
  expect(classifyAccountActivity({ lastSignInAt: daysAgo(15) }, NOW)).toBe("inaktiv");
  expect(classifyAccountActivity({ lastActivityAt: daysAgo(30) }, NOW)).toBe("inaktiv");
});

it("marks accounts without use for over 30 days as lange_nicht_da", () => {
  expect(classifyAccountActivity({ lastSignInAt: daysAgo(60) }, NOW)).toBe("lange_nicht_da");
  expect(classifyAccountActivity({}, NOW)).toBe("lange_nicht_da");
});

it("uses the newest of login, activity, and signup", () => {
  expect(
    classifyAccountActivity(
      { lastSignInAt: daysAgo(90), lastActivityAt: daysAgo(1), createdAt: daysAgo(90) },
      NOW,
    ),
  ).toBe("aktiv");
});

it("treats a brand-new signup without activity as aktiv, not churned", () => {
  expect(classifyAccountActivity({ createdAt: daysAgo(1) }, NOW)).toBe("aktiv");
});

it("measures the share of older accounts that came back within 7 days", () => {
  const accounts = [
    { createdAt: daysAgo(60), lastSignInAt: daysAgo(2), lastActivityAt: null },
    { createdAt: daysAgo(60), lastSignInAt: daysAgo(20), lastActivityAt: null },
    { createdAt: daysAgo(2), lastSignInAt: null, lastActivityAt: null },
  ];
  expect(summarizeRetention(accounts, NOW)).toEqual({ eligible: 2, returned: 1, rate: 0.5 });
});

it("returns a null retention rate when no account is old enough", () => {
  const accounts = [{ createdAt: daysAgo(1), lastSignInAt: null, lastActivityAt: null }];
  expect(summarizeRetention(accounts, NOW).rate).toBeNull();
});

it("computes stickiness as average daily actives over 30-day actives", () => {
  const accounts = [
    { createdAt: daysAgo(60), lastSignInAt: daysAgo(1), lastActivityAt: null },
    { createdAt: daysAgo(60), lastSignInAt: daysAgo(10), lastActivityAt: null },
    { createdAt: daysAgo(60), lastSignInAt: daysAgo(90), lastActivityAt: null },
  ];
  const result = summarizeStickiness(accounts, [2, 4], NOW);
  expect(result.active30Days).toBe(2);
  expect(result.averageDailyActive).toBe(3);
  expect(result.ratio).toBe(1.5);
});
