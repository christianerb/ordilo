import { describe, expect, it } from "vitest";
import { berlinDay, startOfBerlinWeek } from "@/lib/berlin-date";
import {
  cohortWeekStarts,
  summarizeFamilyBilling,
  summarizeGrowth,
  type EntitlementRow,
  GROWTH_EVENT_NAMES,
  parseGrowthEventDays,
  type GrowthAccount,
  type GrowthEventDay,
} from "../growth-metrics";

// Wednesday, 2026-10-21 12:00 UTC
const NOW = new Date("2026-10-21T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const after = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() + days * DAY).toISOString();

function account(id: string, createdAt: string, attribution: GrowthAccount["attribution"] = {}): GrowthAccount {
  return { id, createdAt, attribution };
}
/** One aggregated day with a single event (first = last). */
function event(user_id: string, event_name: string, at: string, count = 1): GrowthEventDay {
  return { user_id, event_name, first_at: at, last_at: at, event_count: count };
}

function summarize(
  accounts: GrowthAccount[],
  events: GrowthEventDay[],
  payingUserIds = new Set<string>(),
  // App opens measured since long before these tests' accounts.
  appOpensSince: string | null = daysAgo(400),
) {
  return summarizeGrowth({
    accounts,
    events,
    payingUserIds,
    since: daysAgo(30),
    appOpensSince,
    now: NOW,
  });
}

describe("summarizeGrowth — activation", () => {
  it("activates only people who confirmed and asked within 7 days", () => {
    const created = daysAgo(20);
    const accounts = [
      account("fast", created),
      account("late", created),
      account("confirm-only", created),
    ];
    const events = [
      event("fast", "document_confirmed", after(created, 1)),
      event("fast", "search_completed", after(created, 2)),
      event("late", "document_confirmed", after(created, 1)),
      event("late", "chat_question_sent", after(created, 9)),
      event("confirm-only", "document_confirmed", after(created, 1)),
    ];
    const summary = summarize(accounts, events);
    expect(summary.funnel.find((step) => step.key === "activated")?.count).toBe(1);
    expect(summary.activation).toEqual({ eligible: 3, count: 1, rate: 1 / 3 });
  });

  it("leaves accounts younger than 7 days out of the activation rate", () => {
    const summary = summarize(
      [account("old", daysAgo(10)), account("young", daysAgo(2))],
      [
        event("young", "document_confirmed", daysAgo(1.5)),
        event("young", "search_completed", daysAgo(1)),
      ],
    );
    // The young account already activated and shows in the funnel …
    expect(summary.funnel.find((step) => step.key === "activated")?.count).toBe(1);
    // … but the rate only counts accounts whose 7 days are over.
    expect(summary.activation).toEqual({ eligible: 1, count: 0, rate: 0 });
  });

  it("counts funnel steps per person, not per event", () => {
    const created = daysAgo(5);
    const summary = summarize(
      [account("a", created), account("b", created)],
      [
        event("a", "onboarding_completed", after(created, 0.01)),
        event("a", "document_upload_succeeded", after(created, 0.02)),
        event("a", "document_upload_succeeded", after(created, 0.03)),
        event("b", "invite_accepted", after(created, 0.01)),
      ],
    );
    const counts = Object.fromEntries(summary.funnel.map((step) => [step.key, step.count]));
    expect(counts).toMatchObject({ signup: 2, family: 2, upload: 1, confirm: 0 });
  });

  it("only includes accounts created inside the window", () => {
    const summary = summarize([account("old", daysAgo(60)), account("new", daysAgo(2))], []);
    expect(summary.signups).toBe(1);
    expect(summary.activation.rate).toBeNull();
  });

  it("reports the median time to the first confirmed document", () => {
    const created = daysAgo(10);
    const summary = summarize(
      [account("a", created), account("b", created), account("c", created)],
      [
        event("a", "document_confirmed", after(created, 1 / 24)),
        event("b", "document_confirmed", after(created, 3 / 24)),
        event("b", "document_confirmed", after(created, 5)),
      ],
    );
    expect(summary.medianHoursToFirstConfirm).toBeCloseTo(2);
  });

  it("has no rates without signups", () => {
    const summary = summarize([], []);
    expect(summary.activation.rate).toBeNull();
    expect(summary.medianHoursToFirstConfirm).toBeNull();
    expect(summary.channels).toEqual([]);
  });
});

describe("summarizeGrowth — channels", () => {
  it("groups signups by channel with activation, return and paying counts", () => {
    const created = daysAgo(20);
    const accounts = [
      account("s1", created, { referrer: "google.de" }),
      account("s2", created, { referrer: "google.de" }),
      account("legacy", created, null),
    ];
    const events = [
      event("s1", "document_confirmed", after(created, 1)),
      event("s1", "chat_question_sent", after(created, 1)),
      event("s1", "app_opened", after(created, 8)),
    ];
    const summary = summarize(accounts, events, new Set(["s1"]));
    expect(summary.channels).toEqual([
      {
        channel: "suche",
        signups: 2,
        activation: { eligible: 2, count: 1, rate: 0.5 },
        paying: 1,
        week1: { eligible: 2, count: 1, rate: 0.5 },
      },
      {
        channel: "unbekannt",
        signups: 1,
        activation: { eligible: 1, count: 0, rate: 0 },
        paying: 0,
        week1: { eligible: 1, count: 0, rate: 0 },
      },
    ]);
  });

  it("attributes an invite accepted right after signup to the invite", () => {
    const created = daysAgo(3);
    const summary = summarize(
      [account("joined", created, { via: "app" }), account("later", created, { via: "app" })],
      [
        event("joined", "invite_accepted", after(created, 0.1)),
        event("later", "invite_accepted", after(created, 2)),
      ],
    );
    const channels = Object.fromEntries(summary.channels.map((row) => [row.channel, row.signups]));
    expect(channels).toEqual({ einladung: 1, app: 1 });
  });

  it("keeps a real marketing channel even when an invite follows", () => {
    const created = daysAgo(3);
    const summary = summarize(
      [account("ad", created, { paid_click: "google" }), account("direct", created, { landing: "/" })],
      [
        event("ad", "invite_accepted", after(created, 0.5)),
        event("direct", "invite_accepted", after(created, 0.5)),
      ],
    );
    const channels = Object.fromEntries(summary.channels.map((row) => [row.channel, row.signups]));
    expect(channels).toEqual({ bezahlt: 1, einladung: 1 });
  });
});

describe("summarizeGrowth — cohorts and activity", () => {
  it("builds weekly cohorts and leaves unfinished return windows open", () => {
    const thisWeek = new Date(startOfBerlinWeek(NOW.getTime())).toISOString();
    const fiveWeeksAgo = new Date(startOfBerlinWeek(NOW.getTime() - 35 * DAY)).toISOString();
    const summary = summarize(
      [account("fresh", thisWeek), account("veteran", fiveWeeksAgo)],
      [
        event("veteran", "app_opened", after(fiveWeeksAgo, 7.5)),
        event("veteran", "search_completed", after(fiveWeeksAgo, 29)),
        // Onboarding is not coming back.
        event("fresh", "onboarding_completed", after(thisWeek, 0.1)),
      ],
    );
    expect(summary.cohorts).toHaveLength(8);
    const latest = summary.cohorts.at(-1)!;
    expect(latest.weekStart).toBe("2026-10-19");
    expect(latest.signups).toBe(1);
    expect(latest.week1.rate).toBeNull();

    const veteran = summary.cohorts.find((row) => row.weekStart === berlinDay(new Date(fiveWeeksAgo)))!;
    expect(veteran.week1).toEqual({ eligible: 1, count: 1, rate: 1 });
    expect(veteran.week4).toEqual({ eligible: 1, count: 1, rate: 1 });
  });

  it("separates opening the app from real use in the last 7 days", () => {
    const summary = summarize(
      [],
      [
        event("reader", "app_opened", daysAgo(1)),
        event("worker", "app_opened", daysAgo(2)),
        event("worker", "task_completed", daysAgo(2)),
        event("gone", "task_completed", daysAgo(9)),
        event("onboarder", "onboarding_completed", daysAgo(1)),
      ],
    );
    expect(summary.weeklyActive).toBe(2);
    expect(summary.weeklyEngaged).toBe(1);
  });

  it("counts invites created and accepted inside the window", () => {
    const summary = summarize(
      [],
      [
        event("owner", "invite_created", daysAgo(3)),
        event("owner", "invite_created", daysAgo(40)),
        event("guest", "invite_accepted", daysAgo(2)),
      ],
    );
    expect(summary.invitesCreated).toBe(1);
    expect(summary.invitesAccepted).toBe(1);
  });
});

describe("cohortWeekStarts", () => {
  it("returns consecutive Berlin Mondays, oldest first, across a DST change", () => {
    const starts = cohortWeekStarts(Date.parse("2026-11-04T12:00:00Z"), 3).map((time) =>
      new Date(time).toISOString(),
    );
    expect(starts).toEqual([
      "2026-10-18T22:00:00.000Z", // Mon 19.10. (summer time)
      "2026-10-25T23:00:00.000Z", // Mon 26.10. (winter time)
      "2026-11-01T23:00:00.000Z", // Mon 02.11.
    ]);
  });

  it("puts a Monday 00:30 Berlin signup into the new week", () => {
    const signup = "2026-10-18T22:30:00.000Z"; // Mon 19.10. 00:30 Berlin
    const summary = summarizeGrowth({
      accounts: [account("monday", signup)],
      events: [],
      payingUserIds: new Set(),
      since: daysAgo(30),
      now: NOW,
    });
    expect(summary.cohorts.find((row) => row.weekStart === "2026-10-19")?.signups).toBe(1);
    expect(summary.cohorts.find((row) => row.weekStart === "2026-10-12")?.signups).toBe(0);
  });
});

describe("summarizeFamilyBilling", () => {
  const row = (overrides: Partial<EntitlementRow>): EntitlementRow => ({
    family_id: "family",
    plan_code: "plus",
    status: "active",
    provider: "revenuecat",
    trial_ends_at: null,
    current_period_ends_at: null,
    grace_ends_at: null,
    ...overrides,
  });

  it("counts only families with paid access right now", () => {
    const { paidFamilies, trialingFamilies } = summarizeFamilyBilling(
      [
        row({ family_id: "active", current_period_ends_at: daysAgo(-10) }),
        row({ family_id: "period-over", current_period_ends_at: daysAgo(2) }),
        row({ family_id: "grace", status: "past_due", grace_ends_at: daysAgo(-3) }),
        row({ family_id: "grace-over", status: "past_due", grace_ends_at: daysAgo(1) }),
        row({ family_id: "trial", status: "trialing", trial_ends_at: daysAgo(-5) }),
        row({ family_id: "trial-over", status: "trialing", trial_ends_at: daysAgo(1) }),
        row({ family_id: "manual", provider: null }),
        row({ family_id: "free", plan_code: "free", status: "free", provider: null }),
        row({ family_id: "canceled", status: "canceled" }),
      ],
      NOW,
    );
    expect([...paidFamilies].sort()).toEqual(["active", "grace"]);
    expect([...trialingFamilies]).toEqual(["trial"]);
  });
});

describe("summarizeGrowth — aggregated day rows", () => {
  it("counts a day whose last event falls inside the return window", () => {
    const created = daysAgo(20);
    // Day 6 after signup: first event before the week-1 window, last after its start.
    const row: GrowthEventDay = {
      user_id: "a",
      event_name: "app_opened",
      first_at: after(created, 6.9),
      last_at: after(created, 7.1),
      event_count: 2,
    };
    const inWindow = summarize([account("a", created)], [row]);
    expect(inWindow.cohorts.find((cohort) => cohort.signups === 1)?.week1.count).toBe(1);

    const before = summarize([account("a", created)], [{ ...row, last_at: after(created, 6.95) }]);
    expect(before.cohorts.find((cohort) => cohort.signups === 1)?.week1.count).toBe(0);
  });

  it("sums event counts for invites", () => {
    const summary = summarize(
      [],
      [event("owner", "invite_created", daysAgo(3), 3), event("guest", "invite_accepted", daysAgo(2), 2)],
    );
    expect(summary.invitesCreated).toBe(3);
    expect(summary.invitesAccepted).toBe(2);
  });

  it("loads exactly the events the metrics read", () => {
    expect(GROWTH_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        "app_opened",
        "document_confirmed",
        "chat_question_sent",
        "search_completed",
        "onboarding_completed",
        "invite_accepted",
        "invite_created",
      ]),
    );
    expect(GROWTH_EVENT_NAMES).not.toContain("onboarding_started");
    expect(GROWTH_EVENT_NAMES).not.toContain("onboarding_step_completed");
    expect(new Set(GROWTH_EVENT_NAMES).size).toBe(GROWTH_EVENT_NAMES.length);
  });
});

describe("parseGrowthEventDays", () => {
  it("accepts the RPC's JSON array and rejects anything else", () => {
    const row = {
      user_id: "u",
      event_name: "app_opened",
      first_at: "2026-10-22T08:00:00+00:00",
      last_at: "2026-10-22T08:00:00+00:00",
      event_count: 2,
    };
    expect(parseGrowthEventDays([row])).toEqual([row]);
    expect(parseGrowthEventDays(null)).toEqual([]);
    expect(() => parseGrowthEventDays([{ ...row, event_count: -1 }])).toThrow();
    expect(() => parseGrowthEventDays({ rows: [] })).toThrow();
  });
});

describe("summarizeGrowth — start of app-open measurement", () => {
  it("leaves return windows before the first recorded app open open", () => {
    const created = daysAgo(20);
    const accounts = [account("a", created)];
    // Measuring started 10 days after signup: week 1 lies before it.
    const late = summarize(accounts, [], new Set(), after(created, 10));
    expect(late.channels[0].week1).toEqual({ eligible: 0, count: 0, rate: null });
    expect(late.returnsTrackedSince).toBe(berlinDay(new Date(after(created, 10))));

    // Without any recorded app open nothing can be measured yet.
    const never = summarize(accounts, [event("a", "search_completed", after(created, 8))], new Set(), null);
    expect(never.channels[0].week1.rate).toBeNull();
    expect(never.returnsTrackedSince).toBeNull();
  });
});
