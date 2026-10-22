import { describe, expect, it } from "vitest";
import {
  summarizeGrowth,
  weekStart,
  type GrowthAccount,
  type GrowthEvent,
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
function event(user_id: string, event_name: string, occurred_at: string): GrowthEvent {
  return { user_id, event_name, occurred_at };
}

function summarize(accounts: GrowthAccount[], events: GrowthEvent[], payingUserIds = new Set<string>()) {
  return summarizeGrowth({
    accounts,
    events,
    payingUserIds,
    since: daysAgo(30),
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
    expect(summary.activationRate).toBeCloseTo(1 / 3);
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
    expect(summary.activationRate).toBe(0);
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
    expect(summary.activationRate).toBeNull();
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
        activated: 1,
        paying: 1,
        week1: { eligible: 2, returned: 1, rate: 0.5 },
      },
      {
        channel: "unbekannt",
        signups: 1,
        activated: 0,
        paying: 0,
        week1: { eligible: 1, returned: 0, rate: 0 },
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
});

describe("summarizeGrowth — cohorts and activity", () => {
  it("builds weekly cohorts and leaves unfinished return windows open", () => {
    const thisWeek = new Date(weekStart(NOW.getTime())).toISOString();
    const fiveWeeksAgo = new Date(weekStart(NOW.getTime()) - 5 * 7 * DAY).toISOString();
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
    expect(latest.weekStart).toBe(thisWeek.slice(0, 10));
    expect(latest.signups).toBe(1);
    expect(latest.week1.rate).toBeNull();

    const veteran = summary.cohorts.find((row) => row.weekStart === fiveWeeksAgo.slice(0, 10))!;
    expect(veteran.week1).toEqual({ eligible: 1, returned: 1, rate: 1 });
    expect(veteran.week4).toEqual({ eligible: 1, returned: 1, rate: 1 });
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

describe("weekStart", () => {
  it("returns Monday 00:00 UTC", () => {
    expect(new Date(weekStart(NOW.getTime())).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(new Date(weekStart(Date.parse("2026-10-19T00:00:00Z"))).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z",
    );
    expect(new Date(weekStart(Date.parse("2026-10-25T23:59:00Z"))).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z",
    );
  });
});
