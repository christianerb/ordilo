import { createClient as createAdminClient } from "@/lib/supabase/admin";

/**
 * Shared Bearer auth for scheduler-invoked endpoints (/api/jobs/run,
 * /api/digest/run).
 *
 * Both JOBS_RUNNER_SECRET and CRON_SECRET are accepted when configured —
 * Vercel Cron always sends `Bearer <CRON_SECRET>`, while external
 * schedulers may hold JOBS_RUNNER_SECRET. Accepting either (instead of a
 * `||` precedence pick) means setting both env vars with different values
 * can never silently lock the cron out with daily 401s.
 *
 * Without any configured secret the endpoint is disabled (503) — never open.
 */
export function requireSchedulerAuth(request: Request): Response | null {
  const secrets = [
    process.env.JOBS_RUNNER_SECRET,
    process.env.CRON_SECRET,
  ].filter((s): s is string => Boolean(s));

  if (secrets.length === 0) {
    return Response.json(
      {
        error:
          "Scheduler ist nicht konfiguriert (JOBS_RUNNER_SECRET/CRON_SECRET fehlt).",
        code: "SCHEDULER_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!secrets.some((secret) => authHeader === `Bearer ${secret}`)) {
    return Response.json(
      { error: "Nicht autorisiert.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return null;
}

/** The database's own token is 64 hex characters; anything shorter is not it. */
const MIN_DATABASE_TOKEN_LENGTH = 32;

/**
 * Auth for the background workers pg_cron calls every five minutes
 * (/api/jobs/run, /api/notifications/run).
 *
 * Accepts everything {@link requireSchedulerAuth} accepts — the GitHub
 * workflow and Vercel Cron keep their env secrets — plus the token the
 * database generated for its own scheduler (migration 0096), checked
 * against Supabase Vault through a service-role-only RPC. That token is
 * never copied anywhere, so the schedule needs no manual setup.
 */
export async function requireScheduledWorkerAuth(
  request: Request,
): Promise<Response | null> {
  const envResult = requireSchedulerAuth(request);
  if (!envResult) return null;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token.length < MIN_DATABASE_TOKEN_LENGTH) return envResult;

  try {
    const { data, error } = await createAdminClient().rpc("scheduler_token_valid", {
      p_token: token,
    });
    if (!error && data === true) return null;
  } catch {
    // Database unreachable: answer as the env check did.
  }

  // A bearer token was presented and matched nothing: that is a refusal,
  // not a missing configuration.
  return Response.json(
    { error: "Nicht autorisiert.", code: "UNAUTHORIZED" },
    { status: 401 },
  );
}
