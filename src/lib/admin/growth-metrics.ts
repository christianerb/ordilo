import { z } from "zod";
import {
  berlinDay,
  startOfBerlinDay,
  startOfBerlinDayBefore,
  startOfBerlinWeek,
} from "@/lib/berlin-date";
import { PRODUCT_USE_EVENTS } from "./event-filters";
import { resolveEffectivePlan, type PlanCode, type EntitlementStatus } from "@/lib/billing/entitlements";
import {
  classifyChannel,
  type AcquisitionChannel,
  type SignupAttribution,
} from "@/lib/analytics/attribution";

/**
 * Growth metrics for the admin "Wachstum" tab: where people come from,
 * whether they reach the first value, and whether they come back.
 * Pure module so every definition below stays testable.
 *
 * Definitions (people, not events):
 * - Aktiviert: within 7 days of signup the person confirmed a document
 *   AND asked a question (chat or search). That is the moment Ordilo
 *   answers from the family's own papers.
 * - Zurückgekommen in Woche 1 / Woche 4: any use (including just opening
 *   the app) on days 7–13 / 28–34 after signup. Onboarding steps and
 *   joining a family do not count as coming back.
 * - Rates only count people whose window has fully passed (see Share);
 *   return rates also only windows after app opens were first recorded.
 * - Aktiv genutzt: a core action (upload, confirm, question, task, …),
 *   as opposed to only opening the app.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVATION_WINDOW_DAYS = 7;
/** An invite accepted this soon after signup means the invite brought them. */
const INVITE_SIGNUP_WINDOW_MS = DAY_MS;
/** Stored channels that do not explain why someone came. */
const WEAK_CHANNELS = new Set<AcquisitionChannel>(["direkt", "app", "unbekannt"]);

export type GrowthAccount = {
  id: string;
  createdAt: string;
  attribution: SignupAttribution | null;
};

/**
 * Events of one user, one event name and one Berlin day, as aggregated by
 * the admin_growth_event_days RPC. First and last time are enough for
 * every window check below: a window is at least a day long, so it can
 * cut a day at one end only.
 */
export type GrowthEventDay = {
  user_id: string;
  event_name: string;
  first_at: string;
  last_at: string;
  event_count: number;
};

const growthEventDaySchema = z.object({
  user_id: z.string(),
  event_name: z.string(),
  first_at: z.string(),
  last_at: z.string(),
  event_count: z.coerce.number().int().nonnegative(),
});

/** Validate the JSON array returned by the admin_growth_event_days RPC. */
export function parseGrowthEventDays(value: unknown): GrowthEventDay[] {
  return z.array(growthEventDaySchema).parse(value ?? []);
}

const QUESTION_EVENTS = new Set(["chat_question_sent", "search_completed"]);


/** Use that counts as coming back. Onboarding and joining do not. */
const RETURN_EVENTS = new Set([
  ...PRODUCT_USE_EVENTS,
  "app_opened",
  "document_upload_failed",
  "chat_answer_repair_started",
]);

/** Every event name the metrics read — the RPC loads only these. */
export const GROWTH_EVENT_NAMES = [
  ...new Set([...RETURN_EVENTS, "onboarding_completed", "invite_accepted"]),
];

type Interval = { from: number; to: number };

type UserTimeline = {
  first: Map<string, number>;
  /** Days with use that counts as coming back. */
  returns: Interval[];
  /** Days with a core action. */
  core: Interval[];
};

function buildTimelines(events: GrowthEventDay[]): Map<string, UserTimeline> {
  const timelines = new Map<string, UserTimeline>();
  for (const event of events) {
    const from = new Date(event.first_at).getTime();
    const to = new Date(event.last_at).getTime();
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    let timeline = timelines.get(event.user_id);
    if (!timeline) {
      timeline = { first: new Map(), returns: [], core: [] };
      timelines.set(event.user_id, timeline);
    }
    const previous = timeline.first.get(event.event_name);
    if (previous === undefined || from < previous) {
      timeline.first.set(event.event_name, from);
    }
    if (RETURN_EVENTS.has(event.event_name)) timeline.returns.push({ from, to });
    if (PRODUCT_USE_EVENTS.has(event.event_name)) timeline.core.push({ from, to });
  }
  return timelines;
}

/** Whether any event of these days falls in [start, end). */
function anyBetween(days: Interval[] | undefined, start: number, end: number): boolean {
  return days?.some((day) => day.to >= start && day.from < end) ?? false;
}

function firstOf(timeline: UserTimeline | undefined, names: Iterable<string>): number | null {
  if (!timeline) return null;
  let earliest: number | null = null;
  for (const name of names) {
    const time = timeline.first.get(name);
    if (time !== undefined && (earliest === null || time < earliest)) earliest = time;
  }
  return earliest;
}

function isActivated(account: GrowthAccount, timeline: UserTimeline | undefined): boolean {
  const start = new Date(account.createdAt).getTime();
  const deadline = start + ACTIVATION_WINDOW_DAYS * DAY_MS;
  const confirmed = firstOf(timeline, ["document_confirmed"]);
  const asked = firstOf(timeline, QUESTION_EVENTS);
  return confirmed !== null && asked !== null && confirmed <= deadline && asked <= deadline;
}

function channelForAccount(
  account: GrowthAccount,
  timeline: UserTimeline | undefined,
): AcquisitionChannel {
  const stored = classifyChannel(account.attribution);
  // A real marketing channel always wins. Only when the stored touch says
  // nothing about why they came (direct, the app's own login screen, or an
  // account from before attribution) does an invite accepted right after
  // signup explain it.
  if (!WEAK_CHANNELS.has(stored)) return stored;
  const joined = firstOf(timeline, ["invite_accepted"]);
  const created = new Date(account.createdAt).getTime();
  if (joined !== null && joined - created <= INVITE_SIGNUP_WINDOW_MS) return "einladung";
  return stored;
}

/**
 * A share among the people whose window has fully passed. `rate` is null
 * while nobody in the group is old enough yet, so young accounts never
 * drag a rate down before they had their chance.
 */
export type Share = { eligible: number; count: number; rate: number | null };

function shareOf(
  accounts: GrowthAccount[],
  now: number,
  windowDays: number,
  hit: (account: GrowthAccount, created: number) => boolean,
  measurableFrom: (created: number) => boolean = () => true,
): Share {
  let eligible = 0;
  let count = 0;
  for (const account of accounts) {
    const created = new Date(account.createdAt).getTime();
    if (now < created + windowDays * DAY_MS || !measurableFrom(created)) continue;
    eligible += 1;
    if (hit(account, created)) count += 1;
  }
  return { eligible, count, rate: eligible === 0 ? null : count / eligible };
}

/**
 * Came back on days [startDay, endDay) after signup. Only windows that
 * start after app opens were first recorded count: before that, someone
 * who only opened the app left no trace and would look like they never
 * came back. `trackedSince` null means no app open was recorded yet.
 */
function returnedBetween(
  accounts: GrowthAccount[],
  timelines: Map<string, UserTimeline>,
  startDay: number,
  endDay: number,
  now: number,
  trackedSince: number | null,
): Share {
  return shareOf(
    accounts,
    now,
    endDay,
    (account, created) =>
      anyBetween(timelines.get(account.id)?.returns, created + startDay * DAY_MS, created + endDay * DAY_MS),
    (created) => trackedSince !== null && created + startDay * DAY_MS >= trackedSince,
  );
}


/** Activated, among accounts whose 7-day window has passed. */
function activationOf(
  accounts: GrowthAccount[],
  timelines: Map<string, UserTimeline>,
  now: number,
): Share {
  return shareOf(accounts, now, ACTIVATION_WINDOW_DAYS, (account) =>
    isActivated(account, timelines.get(account.id)),
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Start instants (Monday 00:00 Berlin time) of the last `weeks` weeks,
 * oldest first. Stepping from mid-week keeps a DST change from skipping
 * or repeating a week.
 */
export function cohortWeekStarts(nowMs: number, weeks: number): number[] {
  const current = startOfBerlinWeek(nowMs);
  return Array.from({ length: weeks }, (_, index) =>
    startOfBerlinWeek(current + 3 * DAY_MS - (weeks - 1 - index) * 7 * DAY_MS),
  );
}

export type FunnelStep = { key: string; label: string; count: number };

export type ChannelRow = {
  channel: AcquisitionChannel;
  signups: number;
  activation: Share;
  paying: number;
  week1: Share;
};

export type CohortRow = {
  weekStart: string;
  signups: number;
  activation: Share;
  week1: Share;
  week4: Share;
};

export type GrowthSummary = {
  signups: number;
  /** How far the window's new accounts got so far. */
  funnel: FunnelStep[];
  /** Activation of the accounts whose 7 days ended in the period. */
  activation: Share;
  /** Median hours from signup to the first confirmed document. */
  medianHoursToFirstConfirm: number | null;
  channels: ChannelRow[];
  cohorts: CohortRow[];
  /** Distinct people with any use today or in the 6 Berlin days before. */
  weeklyActive: number;
  /** Distinct people with a core action in the last 7 days. */
  weeklyEngaged: number;
  /** Berlin day (YYYY-MM-DD) app opens were first recorded, or null. */
  returnsTrackedSince: string | null;
  invitesCreated: number;
  invitesAccepted: number;
};

export function summarizeGrowth({
  accounts,
  events,
  payingUserIds,
  since,
  appOpensSince = null,
  now = new Date(),
  cohortWeeks = 8,
}: {
  accounts: GrowthAccount[];
  events: GrowthEventDay[];
  payingUserIds: Set<string>;
  /** Start of the signup window (ISO), a Berlin midnight. */
  since: string;
  /** First app_opened ever recorded (ISO), or null if none yet. */
  appOpensSince?: string | null;
  now?: Date;
  cohortWeeks?: number;
}): GrowthSummary {
  const nowMs = now.getTime();
  const sinceMs = new Date(since).getTime();
  const timelines = buildTimelines(events);
  const trackedSince =
    appOpensSince === null ? null : startOfBerlinDay(new Date(appOpensSince).getTime());
  const inWindow = accounts.filter(
    (account) => new Date(account.createdAt).getTime() >= sinceMs,
  );

  const reached = (names: string[]) =>
    inWindow.filter((account) => firstOf(timelines.get(account.id), names) !== null).length;

  const funnel: FunnelStep[] = [
    { key: "signup", label: "Konto angelegt", count: inWindow.length },
    {
      key: "family",
      label: "In einer Familie (Einrichtung fertig oder Einladung angenommen)",
      count: reached(["onboarding_completed", "invite_accepted"]),
    },
    { key: "upload", label: "Erstes Dokument hochgeladen", count: reached(["document_upload_succeeded"]) },
    { key: "confirm", label: "Erstes Dokument bestätigt", count: reached(["document_confirmed"]) },
    { key: "question", label: "Erste Frage gestellt", count: reached([...QUESTION_EVENTS]) },
    {
      key: "activated",
      label: `Aktiviert (bestätigt und gefragt in ${ACTIVATION_WINDOW_DAYS} Tagen)`,
      count: inWindow.filter((account) => isActivated(account, timelines.get(account.id))).length,
    },
  ];

  const hoursToConfirm: number[] = [];
  for (const account of inWindow) {
    const confirmed = firstOf(timelines.get(account.id), ["document_confirmed"]);
    if (confirmed === null) continue;
    hoursToConfirm.push(
      Math.max(0, (confirmed - new Date(account.createdAt).getTime()) / (60 * 60 * 1000)),
    );
  }

  // Rates for the period look at accounts whose window *ended* in it —
  // accounts that signed up in the period would not have had their 7 or
  // 14 days yet (with "7 Tage" none of them would).
  const endedInPeriod = (account: GrowthAccount, windowDays: number) => {
    const end = new Date(account.createdAt).getTime() + windowDays * DAY_MS;
    return end >= sinceMs && end <= nowMs;
  };
  const activationPool = accounts.filter((account) => endedInPeriod(account, ACTIVATION_WINDOW_DAYS));
  const week1Pool = accounts.filter((account) => endedInPeriod(account, 14));

  const channelOf = new Map<string, AcquisitionChannel>();
  for (const account of [...inWindow, ...activationPool, ...week1Pool]) {
    if (!channelOf.has(account.id)) {
      channelOf.set(account.id, channelForAccount(account, timelines.get(account.id)));
    }
  }
  const inChannel = (pool: GrowthAccount[], channel: AcquisitionChannel) =>
    pool.filter((account) => channelOf.get(account.id) === channel);
  const channels: ChannelRow[] = [...new Set(channelOf.values())]
    .map((channel) => {
      const signups = inChannel(inWindow, channel);
      return {
        channel,
        signups: signups.length,
        activation: activationOf(inChannel(activationPool, channel), timelines, nowMs),
        paying: signups.filter((account) => payingUserIds.has(account.id)).length,
        week1: returnedBetween(inChannel(week1Pool, channel), timelines, 7, 14, nowMs, trackedSince),
      };
    })
    .sort((left, right) => right.signups - left.signups);

  const cohorts: CohortRow[] = [];
  for (const start of cohortWeekStarts(nowMs, cohortWeeks)) {
    const end = startOfBerlinWeek(start + 10 * DAY_MS);
    const members = accounts.filter((account) => {
      const created = new Date(account.createdAt).getTime();
      return created >= start && created < end;
    });
    cohorts.push({
      weekStart: berlinDay(new Date(start)),
      signups: members.length,
      activation: activationOf(members, timelines, nowMs),
      week1: returnedBetween(members, timelines, 7, 14, nowMs, trackedSince),
      week4: returnedBetween(members, timelines, 28, 35, nowMs, trackedSince),
    });
  }

  // "7 Tage" = today and the 6 Berlin days before, as on the other tabs.
  const weekAgo = startOfBerlinDayBefore(nowMs, 6);
  let weeklyActive = 0;
  let weeklyEngaged = 0;
  for (const timeline of timelines.values()) {
    if (anyBetween(timeline.returns, weekAgo, nowMs + 1)) weeklyActive += 1;
    if (anyBetween(timeline.core, weekAgo, nowMs + 1)) weeklyEngaged += 1;
  }

  // Rows are per Berlin day and `since` is a Berlin midnight, so a row is
  // either fully inside the window or fully outside.
  const countInWindow = (name: string) =>
    events
      .filter((event) => event.event_name === name && new Date(event.first_at).getTime() >= sinceMs)
      .reduce((sum, event) => sum + event.event_count, 0);

  return {
    signups: inWindow.length,
    funnel,
    activation: activationOf(activationPool, timelines, nowMs),
    medianHoursToFirstConfirm: median(hoursToConfirm),
    channels,
    cohorts,
    weeklyActive,
    weeklyEngaged,
    invitesCreated: countInWindow("invite_created"),
    invitesAccepted: countInWindow("invite_accepted"),
    returnsTrackedSince: trackedSince === null ? null : berlinDay(new Date(trackedSince)),
  };
}

export type EntitlementRow = {
  family_id: string;
  plan_code: PlanCode;
  status: EntitlementStatus;
  provider: string | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  grace_ends_at: string | null;
};

/**
 * Families with paid access right now, split into paying and trialing.
 * Uses the billing rules (resolveEffectivePlan), so a trial, period or
 * grace window that already ended counts as free even if a late webhook
 * has not updated the status yet. Manual grants have no provider and are
 * not revenue.
 */
export function summarizeFamilyBilling(
  rows: EntitlementRow[],
  now: Date = new Date(),
): { paidFamilies: Set<string>; trialingFamilies: Set<string> } {
  const paidFamilies = new Set<string>();
  const trialingFamilies = new Set<string>();
  for (const row of rows) {
    if (!row.provider) continue;
    const plan = resolveEffectivePlan(
      {
        plan: row.plan_code,
        status: row.status,
        trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
        currentPeriodEndsAt: row.current_period_ends_at ? new Date(row.current_period_ends_at) : null,
        graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
      },
      now,
    );
    if (plan === "free") continue;
    if (row.status === "trialing") trialingFamilies.add(row.family_id);
    else paidFamilies.add(row.family_id);
  }
  return { paidFamilies, trialingFamilies };
}
