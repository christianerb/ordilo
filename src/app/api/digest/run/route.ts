import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { requireSchedulerAuth } from "@/lib/scheduler-auth";
import {
  buildFamilyDigest,
  digestHtml,
  digestSubject,
  digestText,
  DIGEST_HORIZON_DAYS,
  type DigestEvent,
  type DigestTask,
} from "@/lib/digest";
import { eventOccursOn, type CalendarEvent } from "@/lib/calendar";

/**
 * GET|POST /api/digest/run — the daily reminder digest.
 *
 * For every family with open, CONFIRMED tasks that are overdue or due
 * within {@link DIGEST_HORIZON_DAYS} days, sends ONE German email per
 * family member (via the Resend REST batch API — no SDK dependency).
 * Unconfirmed auto-extracted tasks are excluded: the digest must only
 * reference tasks the family actually accepted (the same
 * `confirmed = true` filter every in-app task surface applies).
 * Families without due tasks get nothing.
 *
 * Invocation: scheduled via Vercel Cron (see vercel.json) — Vercel sends
 * a GET with `Authorization: Bearer <CRON_SECRET>`. Manual/external
 * schedulers can POST with either configured secret (see
 * {@link requireSchedulerAuth}). Runs are NOT deduplicated: schedule it
 * once per day; invoking twice sends the digest twice.
 *
 * Configuration (all server-side env vars):
 *   - CRON_SECRET and/or JOBS_RUNNER_SECRET — required (auth).
 *   - RESEND_API_KEY — required, otherwise 503 (endpoint disabled, never open).
 *   - DIGEST_FROM_EMAIL — sender, default "Ordilo <onboarding@resend.dev>"
 *     (Resend's sandbox sender; replace with a verified domain for launch).
 *   - APP_BASE_URL — absolute app URL for links, falls back to the
 *     request origin.
 */

const RESEND_BATCH_ENDPOINT = "https://api.resend.com/emails/batch";

/** Resend's batch API accepts up to 100 emails per request. */
const RESEND_BATCH_SIZE = 100;

/**
 * Upper bound on due tasks per run. Well above any realistic MVP load;
 * if it is ever hit, the response reports `tasks_truncated: true` so the
 * limit becomes visible instead of a silent PostgREST row cap.
 */
const TASKS_QUERY_LIMIT = 2000;

/** Upper bound on calendar events considered per run (same rationale). */
const EVENTS_QUERY_LIMIT = 2000;

interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function handleDigest(request: Request): Promise<Response> {
  // 1. Authenticate the scheduler ------------------------------------------
  const authError = requireSchedulerAuth(request);
  if (authError) return authError;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json(
      {
        error: "E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt).",
        code: "DIGEST_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const fromEmail =
    process.env.DIGEST_FROM_EMAIL || "Ordilo <onboarding@resend.dev>";
  const appUrl = process.env.APP_BASE_URL || new URL(request.url).origin;

  // 2. Find due tasks ------------------------------------------------------
  // Note: dates are UTC day boundaries. The cron fires at 06:00 UTC, where
  // the UTC and Europe/Berlin calendar dates coincide; a manual invocation
  // between 22:00–24:00 UTC would shift the overdue split by one Berlin day.
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(
    Date.now() + DIGEST_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  const { data: tasks, error: tasksError } = await admin
    .from("tasks")
    .select("id, family_id, title, due_date, priority")
    .eq("status", "open")
    .eq("confirmed", true)
    .not("due_date", "is", null)
    .lte("due_date", horizon)
    .limit(TASKS_QUERY_LIMIT);

  if (tasksError) {
    return Response.json(
      { error: "Aufgaben konnten nicht geladen werden.", code: "QUERY_FAILED" },
      { status: 500 },
    );
  }

  const tasksTruncated = (tasks?.length ?? 0) >= TASKS_QUERY_LIMIT;

  const byFamily = new Map<string, DigestTask[]>();
  for (const task of tasks ?? []) {
    if (!task.due_date) continue;
    const list = byFamily.get(task.family_id) ?? [];
    list.push({
      id: task.id,
      title: task.title,
      due_date: task.due_date,
      priority: task.priority,
    });
    byFamily.set(task.family_id, list);
  }

  // 2b. Find calendar entries happening today or tomorrow ------------------
  // Recurring series can have started long ago, so the filter keeps every
  // series plus any one-off that has not ended yet; eventOccursOn expands
  // occurrences for the two target days.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data: eventRows } = await admin
    .from("calendar_events")
    .select(
      "id, family_id, title, starts_on, ends_on, all_day, starts_time, ends_time, recurrence, recurrence_until, recurrence_exceptions, location, responsible_member_id",
    )
    .lte("starts_on", tomorrow)
    .or(`ends_on.gte.${today},recurrence.neq.none`)
    .limit(EVENTS_QUERY_LIMIT);

  const responsibleIds = [
    ...new Set(
      (eventRows ?? [])
        .map((event) => event.responsible_member_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const responsibleNames = new Map<string, string>();
  if (responsibleIds.length > 0) {
    const { data: memberRows } = await admin
      .from("family_members")
      .select("id, name")
      .in("id", responsibleIds);
    for (const member of memberRows ?? []) {
      responsibleNames.set(member.id, member.name);
    }
  }

  const eventsByFamily = new Map<string, DigestEvent[]>();
  for (const row of eventRows ?? []) {
    const occurrenceSource = {
      ...row,
      recurrence: row.recurrence as CalendarEvent["recurrence"],
      recurrence_exceptions: row.recurrence_exceptions ?? [],
    };
    for (const day of [today, tomorrow]) {
      if (!eventOccursOn(occurrenceSource, day)) continue;
      const list = eventsByFamily.get(row.family_id) ?? [];
      list.push({
        id: row.id,
        title: row.title,
        date: day,
        starts_time: row.all_day ? null : row.starts_time,
        location: row.location,
        responsible_name: row.responsible_member_id
          ? responsibleNames.get(row.responsible_member_id) ?? null
          : null,
      });
      eventsByFamily.set(row.family_id, list);
    }
  }

  if (byFamily.size === 0 && eventsByFamily.size === 0) {
    return Response.json({ status: "ok", families: 0, emails_sent: 0 });
  }

  // 3. Resolve family names + member emails -------------------------------
  const familyIds = [...new Set([...byFamily.keys(), ...eventsByFamily.keys()])];
  const [{ data: families }, { data: memberships }] = await Promise.all([
    admin.from("families").select("id, name").in("id", familyIds),
    admin
      .from("family_memberships")
      .select("family_id, user_id")
      .in("family_id", familyIds),
  ]);

  const familyName = new Map(
    (families ?? []).map((f) => [f.id, f.name] as const),
  );

  // Resolve emails via paginated listUsers — one request per 1000 users
  // total, instead of one auth-admin round trip per member.
  const neededUsers = new Set((memberships ?? []).map((m) => m.user_id));
  const emailByUser = new Map<string, string>();
  for (let page = 1; emailByUser.size < neededUsers.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data || data.users.length === 0) break;
    for (const user of data.users) {
      if (neededUsers.has(user.id) && user.email) {
        emailByUser.set(user.id, user.email);
      }
    }
    if (data.users.length < 1000) break;
  }

  // 4. Build all emails, then send in batches ------------------------------
  const outgoing: OutgoingEmail[] = [];
  let familiesNotified = 0;

  for (const familyId of familyIds) {
    const digest = buildFamilyDigest(
      familyId,
      familyName.get(familyId) ?? "",
      byFamily.get(familyId) ?? [],
      today,
      eventsByFamily.get(familyId) ?? [],
    );
    if (!digest) continue;

    const recipients = (memberships ?? [])
      .filter((m) => m.family_id === familyId)
      .map((m) => emailByUser.get(m.user_id))
      .filter((email): email is string => Boolean(email));
    if (recipients.length === 0) continue;

    familiesNotified++;
    const subject = digestSubject(digest);
    const html = digestHtml(digest, appUrl);
    const text = digestText(digest, appUrl);
    // One email per recipient (never a shared "to" list) so members
    // never see each other's addresses.
    for (const to of recipients) {
      outgoing.push({ from: fromEmail, to, subject, html, text });
    }
  }

  // Resend's batch endpoint takes up to 100 emails per request — batches
  // run sequentially, which also keeps us far below the API rate limit.
  let emailsSent = 0;
  let emailsFailed = 0;
  for (let i = 0; i < outgoing.length; i += RESEND_BATCH_SIZE) {
    const batch = outgoing.slice(i, i + RESEND_BATCH_SIZE);
    try {
      const response = await fetch(RESEND_BATCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (response.ok) emailsSent += batch.length;
      else emailsFailed += batch.length;
    } catch {
      emailsFailed += batch.length;
    }
  }

  return Response.json({
    status: "ok",
    families: familiesNotified,
    emails_sent: emailsSent,
    emails_failed: emailsFailed,
    ...(tasksTruncated ? { tasks_truncated: true } : {}),
  });
}

/** Vercel Cron invokes with GET. */
export async function GET(request: Request): Promise<Response> {
  return handleDigest(request);
}

/** Manual / external schedulers can POST. */
export async function POST(request: Request): Promise<Response> {
  return handleDigest(request);
}
