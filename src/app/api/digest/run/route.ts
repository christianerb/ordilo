import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  buildFamilyDigest,
  digestHtml,
  digestSubject,
  digestText,
  DIGEST_HORIZON_DAYS,
  type DigestTask,
} from "@/lib/digest";

/**
 * GET|POST /api/digest/run — the daily reminder digest.
 *
 * For every family with open tasks that are overdue or due within
 * {@link DIGEST_HORIZON_DAYS} days, sends ONE German email per family
 * member (via the Resend REST API — no SDK dependency). Families without
 * due tasks get nothing.
 *
 * Invocation: scheduled via Vercel Cron (see vercel.json) — Vercel sends
 * a GET with `Authorization: Bearer <CRON_SECRET>`. Manual/external
 * schedulers can POST with the same header. Runs are NOT deduplicated:
 * schedule it once per day; invoking twice sends the digest twice.
 *
 * Configuration (all server-side env vars):
 *   - JOBS_RUNNER_SECRET or CRON_SECRET — required, auth for this endpoint.
 *   - RESEND_API_KEY — required, otherwise 503 (endpoint disabled, never open).
 *   - DIGEST_FROM_EMAIL — sender, default "Ordilo <onboarding@resend.dev>"
 *     (Resend's sandbox sender; replace with a verified domain for launch).
 *   - APP_BASE_URL — absolute app URL for links, falls back to the
 *     request origin.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

async function handleDigest(request: Request): Promise<Response> {
  // 1. Authenticate the scheduler ------------------------------------------
  const secret = process.env.JOBS_RUNNER_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      {
        error: "Digest ist nicht konfiguriert (CRON_SECRET fehlt).",
        code: "DIGEST_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json(
      { error: "Nicht autorisiert.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

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
  const appUrl =
    process.env.APP_BASE_URL || new URL(request.url).origin;

  // 2. Find due tasks ----------------------------------------------------
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
    .not("due_date", "is", null)
    .lte("due_date", horizon);

  if (tasksError) {
    return Response.json(
      { error: "Aufgaben konnten nicht geladen werden.", code: "QUERY_FAILED" },
      { status: 500 },
    );
  }

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

  if (byFamily.size === 0) {
    return Response.json({ status: "ok", families: 0, emails_sent: 0 });
  }

  // 3. Resolve family names + member emails -------------------------------
  const familyIds = [...byFamily.keys()];
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

  // Resolve each distinct user's email once via the auth admin API.
  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const emailByUser = new Map<string, string>();
  await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user?.email) emailByUser.set(userId, data.user.email);
    }),
  );

  // 4. Build + send one email per member -----------------------------------
  let emailsSent = 0;
  let emailsFailed = 0;
  let familiesNotified = 0;

  for (const [familyId, familyTasks] of byFamily) {
    const digest = buildFamilyDigest(
      familyId,
      familyName.get(familyId) ?? "",
      familyTasks,
      today,
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

    // One request per recipient (not one with many "to"s) so members
    // never see each other's addresses.
    const results = await Promise.allSettled(
      recipients.map((to) =>
        fetch(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from: fromEmail, to, subject, html, text }),
        }).then((res) => {
          if (!res.ok) throw new Error(`Resend ${res.status}`);
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") emailsSent++;
      else emailsFailed++;
    }
  }

  return Response.json({
    status: "ok",
    families: familiesNotified,
    emails_sent: emailsSent,
    emails_failed: emailsFailed,
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
