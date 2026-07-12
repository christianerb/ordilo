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
