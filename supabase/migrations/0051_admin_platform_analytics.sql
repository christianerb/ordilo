-- 0048_admin_platform_analytics.sql
--
-- Extends Ordilo's first-party, content-free product events for the
-- internal platform dashboard. No document content, filenames, search
-- terms, chat messages, IP addresses, or access codes are stored here.

alter table public.product_events
  drop constraint if exists product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'onboarding_started',
    'onboarding_step_completed',
    'onboarding_completed',
    'onboarding_scan_started',
    'document_upload_succeeded',
    'document_confirmed',
    'search_completed',
    'chat_question_sent',
    'task_created',
    'task_completed',
    'calendar_event_created'
  ));

create index if not exists product_events_occurred_at_idx
  on public.product_events (occurred_at desc);

-- Failed second-factor attempts are retained only long enough to enforce
-- the account-level rate limit. There is intentionally no code, IP address,
-- user-agent, or user content column.
create table if not exists public.admin_access_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  attempted_at timestamptz not null default now()
);

create index if not exists admin_access_attempts_user_time_idx
  on public.admin_access_attempts (user_id, attempted_at desc);

alter table public.admin_access_attempts enable row level security;

-- No browser policy: only the server-side service-role client manages
-- rate-limit rows.
