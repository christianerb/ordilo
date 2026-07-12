-- 0030_feedback_events.sql
--
-- Privacy-preserving chat feedback events + an aggregated insights view.
--
-- Every thumbs-up/down on a chat answer records an event with METADATA
-- ONLY — never the question, never the answer, never document content:
--   - rating (positive/negative)
--   - reasons (fixed choices the user ticked, e.g. 'falsche_antwort')
--   - comment (free text the user chose to write — the ONE field that may
--     contain user-authored content; the privacy policy must disclose it)
--   - query_kind (server-side heuristic classification of the question:
--     fristen | nummern | personen | suche — computed then discarded)
--   - sources_count / answer_length (shape of the answer, not content)
--
-- `feedback_insights` aggregates events per week × kind × rating so
-- product decisions ("Nummern-Lookups get 40% thumbs-down") never require
-- reading raw rows.

create table if not exists public.chat_feedback_events (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references public.families (id) on delete cascade not null,
  message_id    uuid,                        -- chat_messages.id (no FK: messages may be pruned)
  rating        text not null check (rating in ('positive', 'negative')),
  reasons       text[] not null default '{}',
  comment       text,
  query_kind    text not null default 'suche',  -- fristen | nummern | personen | suche
  sources_count int not null default 0,
  answer_length int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists chat_feedback_events_family_id_idx
  on public.chat_feedback_events (family_id);
create index if not exists chat_feedback_events_kind_idx
  on public.chat_feedback_events (query_kind, rating);

alter table public.chat_feedback_events enable row level security;

drop policy if exists "chat_feedback_events_insert" on public.chat_feedback_events;
create policy "chat_feedback_events_insert" on public.chat_feedback_events
  for insert with check (public.user_belongs_to_family(family_id));

drop policy if exists "chat_feedback_events_select" on public.chat_feedback_events;
create policy "chat_feedback_events_select" on public.chat_feedback_events
  for select using (public.user_belongs_to_family(family_id));

-- ============================================================================
-- Aggregated insights view (for Supabase Studio / a later /admin UI)
-- ============================================================================
--
-- security_invoker: authenticated users only see their own family's rows
-- through RLS; the service role (Studio) sees the global aggregate.

create or replace view public.feedback_insights
with (security_invoker = true) as
select
  date_trunc('week', created_at)::date as week,
  query_kind,
  rating,
  count(*)                             as events,
  round(avg(sources_count), 1)         as avg_sources,
  round(avg(answer_length))            as avg_answer_length,
  count(*) filter (where comment is not null and comment <> '')
                                       as with_comment
from public.chat_feedback_events
group by 1, 2, 3
order by 1 desc, 2, 3;
