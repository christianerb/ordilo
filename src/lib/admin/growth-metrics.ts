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
 * - Aktiv genutzt: a core action (upload, confirm, question, task, …),
 *   as opposed to only opening the app.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVATION_WINDOW_DAYS = 7;
/** An invite accepted this soon after signup means the invite brought them. */
const INVITE_SIGNUP_WINDOW_MS = DAY_MS;

export type GrowthAccount = {
  id: string;
  createdAt: string;
  attribution: SignupAttribution | null;
};

export type GrowthEvent = {
  user_id: string;
  event_name: string;
  occurred_at: string;
};

const QUESTION_EVENTS = new Set(["chat_question_sent", "search_completed"]);

export const CORE_ACTIONS = new Set([
  "document_upload_succeeded",
  "document_confirmed",
  "document_next_step_selected",
  "chat_question_sent",
  "search_completed",
  "task_created",
  "task_completed",
  "calendar_event_created",
  "live_conversation_ended",
  "invite_created",
]);

/** Events that say nothing about coming back. */
const NON_RETURN_EVENTS = new Set([
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_completed",
  "onboarding_entry_selected",
  "onboarding_scan_started",
  "invite_accepted",
]);

type UserTimeline = {
  first: Map<string, number>;
  /** Times of every event that counts as coming back. */
  returns: number[];
  /** Times of every core action. */
  core: number[];
};

function buildTimelines(events: GrowthEvent[]): Map<string, UserTimeline> {
  const timelines = new Map<string, UserTimeline>();
  for (const event of events) {
    const time = new Date(event.occurred_at).getTime();
    if (Number.isNaN(time)) continue;
    let timeline = timelines.get(event.user_id);
    if (!timeline) {
      timeline = { first: new Map(), returns: [], core: [] };
      timelines.set(event.user_id, timeline);
    }
    const previous = timeline.first.get(event.event_name);
    if (previous === undefined || time < previous) {
      timeline.first.set(event.event_name, time);
    }
    if (!NON_RETURN_EVENTS.has(event.event_name)) timeline.returns.push(time);
    if (CORE_ACTIONS.has(event.event_name)) timeline.core.push(time);
  }
  return timelines;
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
  // Native invite joins and accounts created before attribution existed
  // carry no "via: invite" — an invite accepted right after signup is
  // the stronger signal for both.
  const joined = firstOf(timeline, ["invite_accepted"]);
  const created = new Date(account.createdAt).getTime();
  if (joined !== null && joined - created <= INVITE_SIGNUP_WINDOW_MS) return "einladung";
  return classifyChannel(account.attribution);
}

/**
 * Share of people who came back in [startDay, endDay) after signup, among
 * those whose window has fully passed. `rate` is null while nobody in the
 * group is old enough yet.
 */
function returnedBetween(
  accounts: GrowthAccount[],
  timelines: Map<string, UserTimeline>,
  startDay: number,
  endDay: number,
  now: number,
): { eligible: number; returned: number; rate: number | null } {
  let eligible = 0;
  let returned = 0;
  for (const account of accounts) {
    const created = new Date(account.createdAt).getTime();
    if (now < created + endDay * DAY_MS) continue;
    eligible += 1;
    const from = created + startDay * DAY_MS;
    const to = created + endDay * DAY_MS;
    if (timelines.get(account.id)?.returns.some((time) => time >= from && time < to)) {
      returned += 1;
    }
  }
  return { eligible, returned, rate: eligible === 0 ? null : returned / eligible };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Monday 00:00 UTC of the week containing `time`. */
export function weekStart(time: number): number {
  const date = new Date(time);
  date.setUTCHours(0, 0, 0, 0);
  const weekday = (date.getUTCDay() + 6) % 7;
  return date.getTime() - weekday * DAY_MS;
}

export type FunnelStep = { key: string; label: string; count: number };

export type ChannelRow = {
  channel: AcquisitionChannel;
  signups: number;
  activated: number;
  paying: number;
  week1: { eligible: number; returned: number; rate: number | null };
};

export type CohortRow = {
  weekStart: string;
  signups: number;
  activated: number;
  week1: { eligible: number; returned: number; rate: number | null };
  week4: { eligible: number; returned: number; rate: number | null };
};

export type GrowthSummary = {
  signups: number;
  funnel: FunnelStep[];
  activationRate: number | null;
  /** Median hours from signup to the first confirmed document. */
  medianHoursToFirstConfirm: number | null;
  channels: ChannelRow[];
  cohorts: CohortRow[];
  /** Distinct people with any use in the last 7 days. */
  weeklyActive: number;
  /** Distinct people with a core action in the last 7 days. */
  weeklyEngaged: number;
  invitesCreated: number;
  invitesAccepted: number;
};

export function summarizeGrowth({
  accounts,
  events,
  payingUserIds,
  since,
  now = new Date(),
  cohortWeeks = 8,
}: {
  accounts: GrowthAccount[];
  events: GrowthEvent[];
  payingUserIds: Set<string>;
  /** Start of the signup window (ISO). */
  since: string;
  now?: Date;
  cohortWeeks?: number;
}): GrowthSummary {
  const nowMs = now.getTime();
  const sinceMs = new Date(since).getTime();
  const timelines = buildTimelines(events);
  const inWindow = accounts.filter(
    (account) => new Date(account.createdAt).getTime() >= sinceMs,
  );

  const reached = (names: string[]) =>
    inWindow.filter((account) => firstOf(timelines.get(account.id), names) !== null).length;
  const activatedIds = new Set(
    inWindow
      .filter((account) => isActivated(account, timelines.get(account.id)))
      .map((account) => account.id),
  );

  const funnel: FunnelStep[] = [
    { key: "signup", label: "Konto angelegt", count: inWindow.length },
    {
      key: "family",
      label: "In einer Familie (Onboarding fertig oder Einladung angenommen)",
      count: reached(["onboarding_completed", "invite_accepted"]),
    },
    { key: "upload", label: "Erstes Dokument hochgeladen", count: reached(["document_upload_succeeded"]) },
    { key: "confirm", label: "Erstes Dokument bestätigt", count: reached(["document_confirmed"]) },
    { key: "question", label: "Erste Frage gestellt", count: reached([...QUESTION_EVENTS]) },
    {
      key: "activated",
      label: `Aktiviert (bestätigt und gefragt in ${ACTIVATION_WINDOW_DAYS} Tagen)`,
      count: activatedIds.size,
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

  const byChannel = new Map<AcquisitionChannel, GrowthAccount[]>();
  for (const account of inWindow) {
    const channel = channelForAccount(account, timelines.get(account.id));
    byChannel.set(channel, [...(byChannel.get(channel) ?? []), account]);
  }
  const channels: ChannelRow[] = [...byChannel]
    .map(([channel, members]) => ({
      channel,
      signups: members.length,
      activated: members.filter((account) => activatedIds.has(account.id)).length,
      paying: members.filter((account) => payingUserIds.has(account.id)).length,
      week1: returnedBetween(members, timelines, 7, 14, nowMs),
    }))
    .sort((left, right) => right.signups - left.signups);

  const currentWeek = weekStart(nowMs);
  const cohorts: CohortRow[] = [];
  for (let index = cohortWeeks - 1; index >= 0; index -= 1) {
    const start = currentWeek - index * 7 * DAY_MS;
    const end = start + 7 * DAY_MS;
    const members = accounts.filter((account) => {
      const created = new Date(account.createdAt).getTime();
      return created >= start && created < end;
    });
    cohorts.push({
      weekStart: new Date(start).toISOString().slice(0, 10),
      signups: members.length,
      activated: members.filter((account) => isActivated(account, timelines.get(account.id))).length,
      week1: returnedBetween(members, timelines, 7, 14, nowMs),
      week4: returnedBetween(members, timelines, 28, 35, nowMs),
    });
  }

  const weekAgo = nowMs - 7 * DAY_MS;
  let weeklyActive = 0;
  let weeklyEngaged = 0;
  for (const timeline of timelines.values()) {
    if (timeline.returns.some((time) => time >= weekAgo && time <= nowMs)) weeklyActive += 1;
    if (timeline.core.some((time) => time >= weekAgo && time <= nowMs)) weeklyEngaged += 1;
  }

  const countInWindow = (name: string) =>
    events.filter(
      (event) =>
        event.event_name === name && new Date(event.occurred_at).getTime() >= sinceMs,
    ).length;

  return {
    signups: inWindow.length,
    funnel,
    activationRate: inWindow.length === 0 ? null : activatedIds.size / inWindow.length,
    medianHoursToFirstConfirm: median(hoursToConfirm),
    channels,
    cohorts,
    weeklyActive,
    weeklyEngaged,
    invitesCreated: countInWindow("invite_created"),
    invitesAccepted: countInWindow("invite_accepted"),
  };
}
