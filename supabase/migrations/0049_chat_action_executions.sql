-- 0049_chat_action_executions.sql
--
-- Idempotency ledger for user-confirmed chat actions. Before executing a
-- confirmed write, /api/chat/actions records the proposal's stable
-- action_id here. The unique constraint guarantees that a retried confirm
-- (e.g. after a lost response) never executes the same write twice.

create table if not exists public.chat_action_executions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete cascade not null,
  action_id text not null,
  tool_name text not null,
  -- running: claimed, execution in flight; completed: write committed;
  -- failed: execution failed and the family may retry (row gets reclaimed).
  -- A uniqueness conflict alone must never be read as "already done".
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  executed_at timestamptz not null default now()
);

create unique index if not exists chat_action_executions_family_action_idx
  on public.chat_action_executions (family_id, action_id);

alter table public.chat_action_executions enable row level security;

-- Only the service role (API route) reads and writes the ledger. No
-- user-facing policy: family members never query this table directly.
