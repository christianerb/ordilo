import { formatGermanDate } from "@/lib/format";

/**
 * Reminder digest — the pure, testable core of the daily deadline email.
 *
 * The digest answers one question per family, once a day: "Welche Fristen
 * stehen an?" It contains overdue tasks and tasks due within the next
 * DIGEST_HORIZON_DAYS, nothing else — no marketing, no activity feed.
 * Families with no due tasks get NO email (silence is a feature).
 *
 * The API route (/api/digest/run) does the IO: query tasks, resolve
 * member emails, send via Resend. Everything here is deterministic and
 * unit-tested.
 */

/** Tasks due within this many days (plus overdue ones) make the digest. */
export const DIGEST_HORIZON_DAYS = 7;

export interface DigestTask {
  id: string;
  title: string;
  /** ISO date (yyyy-mm-dd). */
  due_date: string;
  priority: string;
}

/** A calendar entry happening today or tomorrow, ready for the email. */
export interface DigestEvent {
  id: string;
  title: string;
  /** ISO date (yyyy-mm-dd) of the occurrence — today or tomorrow. */
  date: string;
  /** HH:MM or null for all-day entries. */
  starts_time: string | null;
  location: string | null;
  /** Name of the member who owns the logistics, if set. */
  responsible_name: string | null;
}

export interface FamilyDigest {
  familyId: string;
  familyName: string;
  overdue: DigestTask[];
  upcoming: DigestTask[];
  /** Calendar entries happening today (all-day first, then by time). */
  todayEvents: DigestEvent[];
  /** Calendar entries happening tomorrow. */
  tomorrowEvents: DigestEvent[];
}

/** All-day entries lead, timed entries follow in chronological order. */
function sortEventsForDay(events: DigestEvent[]): DigestEvent[] {
  return [...events].sort((a, b) => {
    if (a.starts_time === null && b.starts_time === null) return 0;
    if (a.starts_time === null) return -1;
    if (b.starts_time === null) return 1;
    return a.starts_time.localeCompare(b.starts_time);
  });
}

/**
 * Split a family's due tasks into overdue and upcoming (relative to
 * `today`, an ISO yyyy-mm-dd string), each sorted by due date ascending,
 * and group calendar events into today/tomorrow. Returns null when there
 * is nothing to say — no email gets sent.
 */
export function buildFamilyDigest(
  familyId: string,
  familyName: string,
  tasks: DigestTask[],
  today: string,
  events: DigestEvent[] = [],
): FamilyDigest | null {
  const overdue = tasks
    .filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const upcoming = tasks
    .filter((t) => t.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const todayEvents = sortEventsForDay(events.filter((e) => e.date === today));
  const tomorrowEvents = sortEventsForDay(
    events.filter((e) => e.date > today),
  );

  if (
    overdue.length === 0 &&
    upcoming.length === 0 &&
    todayEvents.length === 0 &&
    tomorrowEvents.length === 0
  ) {
    return null;
  }
  return { familyId, familyName, overdue, upcoming, todayEvents, tomorrowEvents };
}

/** The email subject — leads with the most urgent fact. */
export function digestSubject(digest: FamilyDigest): string {
  const total = digest.overdue.length + digest.upcoming.length;
  if (digest.overdue.length > 0) {
    return digest.overdue.length === 1
      ? "Eine Frist ist überfällig — Ordilo erinnert dich"
      : `${digest.overdue.length} Fristen sind überfällig — Ordilo erinnert dich`;
  }
  if (digest.todayEvents.length > 0) {
    const events =
      digest.todayEvents.length === 1
        ? "Ein Termin heute"
        : `${digest.todayEvents.length} Termine heute`;
    return total > 0
      ? `${events} — und ${total === 1 ? "eine Frist" : `${total} Fristen`} diese Woche`
      : `${events} — euer Tagesüberblick`;
  }
  if (total === 0) {
    return digest.tomorrowEvents.length === 1
      ? "Ein Termin morgen — Ordilo denkt mit"
      : `${digest.tomorrowEvents.length} Termine morgen — Ordilo denkt mit`;
  }
  return total === 1
    ? "Eine Frist steht diese Woche an"
    : `${total} Fristen stehen diese Woche an`;
}

function taskLine(task: DigestTask): string {
  const date = formatGermanDate(task.due_date) || task.due_date;
  return `${task.title} — fällig am ${date}`;
}

function eventLine(event: DigestEvent): string {
  const parts: string[] = [];
  if (event.starts_time) parts.push(`${event.starts_time.slice(0, 5)} Uhr:`);
  parts.push(event.title);
  if (event.location) parts.push(`— ${event.location}`);
  if (event.responsible_name) {
    parts.push(`(${event.responsible_name} kümmert sich)`);
  }
  return parts.join(" ");
}

/** Plain-text body (every email needs one alongside the HTML). */
export function digestText(digest: FamilyDigest, appUrl: string): string {
  const lines: string[] = [`Hallo Familie ${digest.familyName},`, ""];
  if (digest.todayEvents.length > 0) {
    lines.push("Heute im Kalender:");
    for (const e of digest.todayEvents) lines.push(`  • ${eventLine(e)}`);
    lines.push("");
  }
  if (digest.tomorrowEvents.length > 0) {
    lines.push("Morgen:");
    for (const e of digest.tomorrowEvents) lines.push(`  • ${eventLine(e)}`);
    lines.push("");
  }
  if (digest.overdue.length > 0) {
    lines.push("Überfällig:");
    for (const t of digest.overdue) lines.push(`  • ${taskLine(t)}`);
    lines.push("");
  }
  if (digest.upcoming.length > 0) {
    lines.push(`In den nächsten ${DIGEST_HORIZON_DAYS} Tagen:`);
    for (const t of digest.upcoming) lines.push(`  • ${taskLine(t)}`);
    lines.push("");
  }
  lines.push(`Alle Aufgaben: ${appUrl}/aufgaben`);
  lines.push(`Euer Planer: ${appUrl}/aufgaben?tab=planer`);
  lines.push("");
  lines.push("Dein Ordilo");
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Brand palette (mirrors the CSS variables in globals.css — email clients
// need literal values). Warm neutrals only; see DESIGN.md's Warm Neutral
// Rule and Apricot Scarcity Rule.
const EMAIL_COLORS = {
  warmWhite: "#FDFCFA",
  graphite: "#262421",
  mistDark: "#625D54",
  petrol: "#305460",
  apricot: "#E46018",
} as const;

function taskListHtml(tasks: DigestTask[]): string {
  return tasks
    .map(
      (t) => `<li style="margin:0 0 8px 0;">
        <strong>${escapeHtml(t.title)}</strong>
        <span style="color:${EMAIL_COLORS.mistDark};"> — fällig am ${
          formatGermanDate(t.due_date) || t.due_date
        }</span></li>`,
    )
    .join("");
}

/**
 * Minimal, inline-styled HTML body (email clients ignore stylesheets).
 * Warm palette matching the app; apricot appears at most ONCE (the
 * "Überfällig" heading) per the Apricot Scarcity Rule.
 */
function eventListHtml(events: DigestEvent[]): string {
  return events
    .map((e) => {
      const time = e.starts_time
        ? `<strong>${escapeHtml(e.starts_time.slice(0, 5))} Uhr</strong> · `
        : "";
      const location = e.location
        ? `<span style="color:${EMAIL_COLORS.mistDark};"> — ${escapeHtml(e.location)}</span>`
        : "";
      const responsible = e.responsible_name
        ? `<span style="color:${EMAIL_COLORS.mistDark};"> · ${escapeHtml(e.responsible_name)} kümmert sich</span>`
        : "";
      return `<li style="margin:0 0 8px 0;">${time}${escapeHtml(e.title)}${location}${responsible}</li>`;
    })
    .join("");
}

export function digestHtml(digest: FamilyDigest, appUrl: string): string {
  const sections: string[] = [];
  if (digest.todayEvents.length > 0) {
    sections.push(`
      <h2 style="font-size:14px;color:${EMAIL_COLORS.petrol};margin:20px 0 8px;">Heute im Kalender</h2>
      <ul style="padding-left:18px;margin:0;">${eventListHtml(digest.todayEvents)}</ul>`);
  }
  if (digest.tomorrowEvents.length > 0) {
    sections.push(`
      <h2 style="font-size:14px;color:${EMAIL_COLORS.petrol};margin:20px 0 8px;">Morgen</h2>
      <ul style="padding-left:18px;margin:0;">${eventListHtml(digest.tomorrowEvents)}</ul>`);
  }
  if (digest.overdue.length > 0) {
    sections.push(`
      <h2 style="font-size:14px;color:${EMAIL_COLORS.apricot};margin:20px 0 8px;">Überfällig</h2>
      <ul style="padding-left:18px;margin:0;">${taskListHtml(digest.overdue)}</ul>`);
  }
  if (digest.upcoming.length > 0) {
    sections.push(`
      <h2 style="font-size:14px;color:${EMAIL_COLORS.petrol};margin:20px 0 8px;">In den nächsten ${DIGEST_HORIZON_DAYS} Tagen</h2>
      <ul style="padding-left:18px;margin:0;">${taskListHtml(digest.upcoming)}</ul>`);
  }

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:${EMAIL_COLORS.warmWhite};color:${EMAIL_COLORS.graphite};padding:24px;max-width:520px;margin:0 auto;">
    <p style="font-size:15px;margin:0 0 4px;">Hallo Familie ${escapeHtml(digest.familyName)},</p>
    <p style="font-size:13px;color:${EMAIL_COLORS.mistDark};margin:0;">Ordilo hat eure Fristen im Blick — das steht an:</p>
    ${sections.join("")}
    <p style="margin:24px 0 0;">
      <a href="${escapeHtml(appUrl)}/aufgaben" style="display:inline-block;background:${EMAIL_COLORS.petrol};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;">Alle Aufgaben ansehen</a></p>
    <p style="font-size:12px;color:${EMAIL_COLORS.mistDark};margin:24px 0 0;">Dein Ordilo</p>
  </div>`;
}
