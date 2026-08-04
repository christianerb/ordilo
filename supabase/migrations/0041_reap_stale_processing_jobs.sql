-- 0041_reap_stale_processing_jobs.sql
--
-- Reaper for stuck pipeline jobs.
--
-- Why: `claim_processing_jobs` (0025) only picks status='pending'. If a
-- worker crashes after claiming (e.g. a serverless timeout), the job stays
-- 'running' forever — and the partial unique index
-- `processing_jobs_active_unique_idx` blocks re-enqueue, so the document is
-- stuck in processing permanently. This function recovers those jobs.
--
-- Semantics mirror markJobFailed in src/lib/jobs/index.ts:
--   - attempts <  max_attempts → back to 'pending' (due immediately), so the
--     next claim picks it up. Attempts are NOT incremented here — claiming
--     already did that.
--   - attempts >= max_attempts → 'dead' (same exhaustion rule as
--     markJobFailed), releasing the unique-index slot so a fresh enqueue is
--     possible again.
--
-- "Stale" means the job has been running longer than p_stale_interval
-- (default 15 minutes — comfortably above the serverless function limit).
-- started_at is set by every claim; updated_at is the fallback for rows
-- written before started_at existed.
--
-- Idempotent: create or replace; safe to re-run.

create or replace function public.reap_stale_processing_jobs(
  p_stale_interval interval default '15 minutes'
)
returns table (reaped_pending integer, marked_dead integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reaped integer;
  v_dead   integer;
begin
  -- Reset retryable stale jobs to 'pending' so claim_processing_jobs picks
  -- them up again. run_after = now() makes them due immediately (the crash
  -- already cost the user time; no extra backoff on top).
  with reaped as (
    update public.processing_jobs j
    set status     = 'pending',
        run_after  = now(),
        updated_at = now(),
        last_error = coalesce(
          j.last_error,
          'Worker abgebrochen; Job wird erneut versucht.'
        )
    where j.status = 'running'
      and j.attempts < j.max_attempts
      and coalesce(j.started_at, j.updated_at) < now() - p_stale_interval
    returning j.id
  )
  select count(*) into v_reaped from reaped;

  -- Jobs that already exhausted their attempts go straight to 'dead',
  -- mirroring markJobFailed's exhaustion branch. This frees the
  -- (document_id, job_type) slot in processing_jobs_active_unique_idx.
  with killed as (
    update public.processing_jobs j
    set status      = 'dead',
        finished_at = now(),
        updated_at  = now(),
        last_error  = coalesce(
          j.last_error,
          'Worker abgebrochen; keine Versuche mehr übrig.'
        )
    where j.status = 'running'
      and j.attempts >= j.max_attempts
      and coalesce(j.started_at, j.updated_at) < now() - p_stale_interval
    returning j.id
  )
  select count(*) into v_dead from killed;

  return query select v_reaped, v_dead;
end;
$$;

-- Only the service-role worker may reap jobs (same posture as
-- claim_processing_jobs).
revoke all on function public.reap_stale_processing_jobs(interval) from public;
revoke all on function public.reap_stale_processing_jobs(interval) from anon, authenticated;
grant execute on function public.reap_stale_processing_jobs(interval) to service_role;
