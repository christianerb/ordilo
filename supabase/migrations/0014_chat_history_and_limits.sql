-- Chat history persistence, rate limiting, and speaker identity.
--
-- Adds:
--   1. chat_conversations + chat_messages tables for conversation persistence.
--   2. chat_usage table for daily rate-limit tracking per family.
--   3. linked_user_id column on family_members for speaker identity.

-- ============================================================================
-- 1. Chat history tables
-- ============================================================================

create table if not exists public.chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid references public.families (id) on delete cascade not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists chat_conversations_family_id_idx
  on public.chat_conversations (family_id, created_at desc);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations (id) on delete cascade not null,
  family_id       uuid references public.families (id) on delete cascade not null,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  sources         jsonb,   -- array of ChatSource objects (assistant messages only)
  card            jsonb,   -- AnswerCard object (assistant messages only)
  feedback        text,    -- 'positive' | 'negative' | null (assistant messages only)
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_conversation_id_idx
  on public.chat_messages (conversation_id, created_at asc);

-- updated_at trigger for chat_conversations.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_conversations_touch_updated_at on public.chat_conversations;
create trigger chat_conversations_touch_updated_at
  before update on public.chat_conversations
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 2. Chat usage / rate-limit tracking
-- ============================================================================

create table if not exists public.chat_usage (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid references public.families (id) on delete cascade not null,
  usage_date    date not null default current_date,
  message_count int not null default 0,
  token_count   int not null default 0,
  unique (family_id, usage_date)
);

create index if not exists chat_usage_family_date_idx
  on public.chat_usage (family_id, usage_date);

-- ============================================================================
-- 3. Speaker identity: link family_members to auth users
-- ============================================================================

alter table public.family_members
  add column if not exists linked_user_id uuid references auth.users (id) on delete set null;

create index if not exists family_members_linked_user_id_idx
  on public.family_members (linked_user_id)
  where linked_user_id is not null;

-- ============================================================================
-- RLS policies
-- ============================================================================

alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.chat_usage         enable row level security;

-- chat_conversations: family-scoped.
create policy "chat_conversations_select" on public.chat_conversations
  for select using (public.user_belongs_to_family(family_id));
create policy "chat_conversations_insert" on public.chat_conversations
  for insert with check (public.user_belongs_to_family(family_id));
create policy "chat_conversations_update" on public.chat_conversations
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "chat_conversations_delete" on public.chat_conversations
  for delete using (public.user_belongs_to_family(family_id));

-- chat_messages: family-scoped (via family_id column for direct RLS check).
create policy "chat_messages_select" on public.chat_messages
  for select using (public.user_belongs_to_family(family_id));
create policy "chat_messages_insert" on public.chat_messages
  for insert with check (public.user_belongs_to_family(family_id));
create policy "chat_messages_update" on public.chat_messages
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "chat_messages_delete" on public.chat_messages
  for delete using (public.user_belongs_to_family(family_id));

-- chat_usage: family-scoped.
create policy "chat_usage_select" on public.chat_usage
  for select using (public.user_belongs_to_family(family_id));
create policy "chat_usage_insert" on public.chat_usage
  for insert with check (public.user_belongs_to_family(family_id));
create policy "chat_usage_update" on public.chat_usage
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
