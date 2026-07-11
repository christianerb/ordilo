import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { runPendingJobs } from "@/lib/jobs";

/**
 * POST /api/jobs/run — the pipeline job worker.
 *
 * Claims due jobs from `processing_jobs` (FOR UPDATE SKIP LOCKED via the
 * `claim_processing_jobs` RPC) and executes them: OCR, analyze, reindex.
 * Safe to invoke concurrently and on a tight schedule — an invocation with
 * no due jobs is a cheap no-op.
 *
 * Invocation: schedule this endpoint via Vercel Cron (vercel.json),
 * pg_cron + pg_net, or any external scheduler. Example Vercel Cron entry:
 *
 *   { "crons": [{ "path": "/api/jobs/run", "schedule": "* * * * *" }] }
 *
 * Auth: requires the JOBS_RUNNER_SECRET env var as a Bearer token
 * (`Authorization: Bearer <secret>`). Vercel Cron sends this automatically
 * when CRON_SECRET is set; we accept either env name. Without a configured
 * secret the endpoint is disabled (503) — never open.
 *
 * Body (optional): { "limit": number } — max jobs to process (1–20,
 * default 5).
 */
export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate the scheduler ------------------------------------------
  const secret = process.env.JOBS_RUNNER_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      {
        error: "Job-Runner ist nicht konfiguriert (JOBS_RUNNER_SECRET fehlt).",
        code: "JOBS_NOT_CONFIGURED",
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

  // 2. Parse optional limit ---------------------------------------------------
  let limit = 5;
  try {
    const body = await request.json();
    if (typeof body?.limit === "number") {
      limit = Math.max(1, Math.min(20, Math.floor(body.limit)));
    }
  } catch {
    // No/invalid body → default limit.
  }

  // 3. Run jobs ---------------------------------------------------------------
  try {
    const adminClient = createAdminClient();
    const summary = await runPendingJobs(adminClient, limit);
    return Response.json(summary, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Job-Ausführung fehlgeschlagen.";
    return Response.json(
      { error: message, code: "JOBS_RUN_FAILED" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/jobs/run — method not allowed.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { error: "Methode nicht erlaubt. Bitte POST verwenden.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
