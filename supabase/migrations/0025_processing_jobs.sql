-- 0025_processing_jobs.sql
--
-- Server-side job queue for the document pipeline (OCR → analyze) and for
-- re-indexing embeddings after pipeline upgrades.
--
-- Why: OCR and extraction previously ran inside long-lived request handlers
-- (the client kept the connection open while the server polled Datalab /
-- called OpenAI). That is fragile on serverless — timeouts strand documents
-- in intermediate statuses and there are no retries. Jobs make the pipeline
-- durable: enqueue on upload, process from a worker (`POST /api/jobs/run`,
-- invoked by Vercel Cron / pg_cron / any scheduler), retry with backoff.
--
-- Concurrency: workers claim jobs via `claim_processing_jobs`, which uses
-- FOR UPDATE SKIP LOCKED so multiple concurrent worker invocations never
-- process the same job twice.
--
-- Security: the worker runs with the service-role key (bypasses RLS).
-- Authenticated users may only SELECT their family's jobs (to display
-- pipeline progress); they cannot insert/update/delete jobs directly.

create table if not exists public.processing_jobs (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid references public.families (id) on delete cascade not null,
  document_id  uuid references public.documents (id) on delete cascade,
  job_type     text not null check (job_type in ('ocr', 'analyze', 'reindex')),
  status       text not null default 'pending'
               check (status in ('pending', 'running', 'done', 'failed', 'dead')),
  attempts     int not null default 0,
  max_attempts int not null default 3,
  run_after    timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

-- Worker poll: pending jobs that are due.
create index if not exists processing_jobs_pending_idx
  on public.processing_jobs (status, run_after)
  where status = 'pending';

create index if not exists processing_jobs_document_id_idx
  on public.processing_jobs (document_id);

create index if not exists processing_jobs_family_id_idx
  on public.processing_jobs (family_id);

-- At most one active (pending/running) job per (document, job_type):
-- enqueueing is idempotent — a second enqueue while one is in flight is a
-- no-op (unique violation handled by the enqueue helper).
create unique index if not exists processing_jobs_active_unique_idx
  on public.processing_jobs (document_id, job_type)
  where status in ('pending', 'running') and document_id is not null;

-- ============================================================================
-- Claim RPC (FOR UPDATE SKIP LOCKED)
-- ============================================================================

create or replace function public.claim_processing_jobs(p_limit int default 5)
returns setof public.processing_jobs
language sql
security definer
set search_path = public
as $$
  update public.processing_jobs j
  set status     = 'running',
      attempts   = j.attempts + 1,
      started_at = now(),
      updated_at = now()
  where j.id in (
    select id
    from public.processing_jobs
    where status = 'pending'
      and run_after <= now()
    order by created_at
    limit greatest(0, least(p_limit, 20))
    for update skip locked
  )
  returning j.*;
$$;

-- Only the service-role worker may claim jobs.
revoke all on function public.claim_processing_jobs(int) from public;
revoke all on function public.claim_processing_jobs(int) from anon, authenticated;
grant execute on function public.claim_processing_jobs(int) to service_role;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.processing_jobs enable row level security;

-- Family members can see their jobs (pipeline progress); all mutations go
-- through the service-role worker, which bypasses RLS.
create policy "processing_jobs_select" on public.processing_jobs
  for select using (public.user_belongs_to_family(family_id));
