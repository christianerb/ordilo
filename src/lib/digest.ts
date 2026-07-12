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

export interface FamilyDigest {
  familyId: string;
  familyName: string;
  overdue: DigestTask[];
  upcoming: DigestTask[];
}

/**
 * Split a family's due tasks into overdue and upcoming (relative to
 * `today`, an ISO yyyy-mm-dd string), each sorted by due date ascending.
 * Returns null when there is nothing to say — no email gets sent.
 */
export function buildFamilyDigest(
  familyId: string,
  familyName: string,
  tasks: DigestTask[],
  today: string,
): FamilyDigest | null {
  const overdue = tasks
    .filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const upcoming = tasks
    .filter((t) => t.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  if (overdue.length === 0 && upcoming.length === 0) return null;
  return { familyId, familyName, overdue, upcoming };
}

/** The email subject — leads with the most urgent fact. */
export function digestSubject(digest: FamilyDigest): string {
  const total = digest.overdue.length + digest.upcoming.length;
  if (digest.overdue.length > 0) {
    return digest.overdue.length === 1
      ? "Eine Frist ist überfällig — Ordilo erinnert dich"
      : `${digest.overdue.length} Fristen sind überfällig — Ordilo erinnert dich`;
  }
  return total === 1
    ? "Eine Frist steht diese Woche an"
    : `${total} Fristen stehen diese Woche an`;
}

function taskLine(task: DigestTask): string {
  const date = formatGermanDate(task.due_date) || task.due_date;
  return `${task.title} — fällig am ${date}`;
}

/** Plain-text body (every email needs one alongside the HTML). */
export function digestText(digest: FamilyDigest, appUrl: string): string {
  const lines: string[] = [`Hallo Familie ${digest.familyName},`, ""];
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

function taskListHtml(tasks: DigestTask[], accent: string): string {
  return tasks
    .map(
      (t) =>
        `<li style="margin:0 0 8px 0;">` +
        `<strong>${escapeHtml(t.title)}</strong>` +
        `<span style="color:${accent};"> — fällig am ${
          formatGermanDate(t.due_date) || t.due_date
        }</span></li>`,
    )
    .join("");
}

/**
 * Minimal, inline-styled HTML body (email clients ignore stylesheets).
 * Petrol/warm-white to match the app; overdue gets the apricot accent.
 */
export function digestHtml(digest: FamilyDigest, appUrl: string): string {
  const sections: string[] = [];
  if (digest.overdue.length > 0) {
    sections.push(
      `<h2 style="font-size:14px;color:#E46018;margin:20px 0 8px;">Überfällig</h2>` +
        `<ul style="padding-left:18px;margin:0;">${taskListHtml(digest.overdue, "#E46018")}</ul>`,
    );
  }
  if (digest.upcoming.length > 0) {
    sections.push(
      `<h2 style="font-size:14px;color:#305460;margin:20px 0 8px;">In den nächsten ${DIGEST_HORIZON_DAYS} Tagen</h2>` +
        `<ul style="padding-left:18px;margin:0;">${taskListHtml(digest.upcoming, "#6B7A80")}</ul>`,
    );
  }

  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;` +
    `background:#FDFCFA;color:#1F2A2E;padding:24px;max-width:520px;margin:0 auto;">` +
    `<p style="font-size:15px;margin:0 0 4px;">Hallo Familie ${escapeHtml(digest.familyName)},</p>` +
    `<p style="font-size:13px;color:#6B7A80;margin:0;">Ordilo hat eure Fristen im Blick — das steht an:</p>` +
    sections.join("") +
    `<p style="margin:24px 0 0;">` +
    `<a href="${escapeHtml(appUrl)}/aufgaben" ` +
    `style="display:inline-block;background:#305460;color:#ffffff;text-decoration:none;` +
    `padding:10px 18px;border-radius:10px;font-size:14px;">Alle Aufgaben ansehen</a></p>` +
    `<p style="font-size:12px;color:#9AA6AA;margin:24px 0 0;">Dein Ordilo</p>` +
    `</div>`
  );
}
