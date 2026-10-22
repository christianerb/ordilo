-- Run the background workers from inside the database, every 5 minutes.
--
-- The GitHub Actions "Job Runner" is scheduled every 5 minutes, but GitHub
-- throttles frequent schedules: in practice it fired about every 5 hours
-- (04:34, 09:35, 14:38 UTC on 2026-10-22). The Vercel cron is daily on the
-- current plan. So stranded OCR/analysis jobs, the knowledge-graph label
-- embedding backfill and reminder delivery could wait for hours.
--
-- pg_cron triggers the same two authenticated endpoints the workflow
-- calls, through pg_net:
--
--   */5  POST {app_origin}/api/jobs/run            (body {"limit": 10})
--   */5  GET  {app_origin}/api/notifications/run   (2 minutes offset)
--
-- Both endpoints are idempotent and concurrency-safe (FOR UPDATE SKIP
-- LOCKED, conditional status transitions), so the GitHub workflow and the
-- daily Vercel cron can keep running alongside as backstops.
--
-- The bearer secret and the app origin live in Supabase Vault, never in a
-- migration. Until both exist the scheduled call is a no-op:
--
--   select vault.create_secret('<JOBS_RUNNER_SECRET value>', 'jobs_runner_secret');
--   select vault.create_secret('https://<production host>', 'app_origin');
--
-- Idempotent: `if not exists` extensions, `create or replace` function,
-- and cron.schedule() upserts a job by its name.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_scheduled_endpoint(
  p_path   text,
  p_method text default 'GET'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_origin text;
  v_url    text;
  v_headers jsonb;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'jobs_runner_secret'
    limit 1;
  select decrypted_secret into v_origin
    from vault.decrypted_secrets
    where name = 'app_origin'
    limit 1;

  -- Not configured yet: do nothing rather than call without auth.
  if coalesce(v_secret, '') = '' or coalesce(v_origin, '') = '' then
    return null;
  end if;

  v_url := rtrim(v_origin, '/') || p_path;
  v_headers := jsonb_build_object(
    'Authorization', 'Bearer ' || v_secret,
    'Content-Type', 'application/json'
  );

  if upper(p_method) = 'POST' then
    return net.http_post(
      url := v_url,
      body := '{"limit": 10}'::jsonb,
      headers := v_headers,
      timeout_milliseconds := 300000
    );
  end if;

  return net.http_get(
    url := v_url,
    headers := v_headers,
    timeout_milliseconds := 300000
  );
end;
$$;

-- Only the scheduler (running as the database owner) may fire it: it
-- reads the runner secret.
revoke execute on function public.invoke_scheduled_endpoint(text, text) from public;
revoke execute on function public.invoke_scheduled_endpoint(text, text) from anon, authenticated;

select cron.schedule(
  'ordilo-jobs-run',
  '*/5 * * * *',
  $$select public.invoke_scheduled_endpoint('/api/jobs/run', 'POST')$$
);

select cron.schedule(
  'ordilo-notifications-run',
  '2-59/5 * * * *',
  $$select public.invoke_scheduled_endpoint('/api/notifications/run', 'GET')$$
);

-- pg_cron never trims its own run log: two five-minute jobs add ~576 rows
-- a day to cron.job_run_details. Keep a week for debugging. (pg_net's
-- net._http_response already expires on its own after six hours.)
select cron.schedule(
  'ordilo-cron-history-cleanup',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
