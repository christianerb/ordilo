-- Provider usage contains identifiers and counts only, never document/query text.
create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  operation text not null,
  user_id uuid references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  provider text not null,
  provider_request_id text,
  model text,
  provider_units numeric,
  input_tokens bigint,
  cached_input_tokens bigint,
  cache_write_tokens bigint,
  output_tokens bigint,
  cost_usd numeric,
  occurred_at timestamptz not null default now(),
  constraint api_usage_nonnegative check (
    coalesce(input_tokens,0) >= 0 and coalesce(cached_input_tokens,0) >= 0
    and coalesce(output_tokens,0) >= 0 and coalesce(cost_usd,0) >= 0
    and coalesce(cache_write_tokens,0) >= 0 and coalesce(provider_units,0) >= 0
  )
);
create unique index if not exists api_usage_provider_request_idx on public.api_usage(provider, provider_request_id) where provider_request_id is not null;
create index if not exists api_usage_user_time_idx on public.api_usage(user_id, occurred_at);
create index if not exists api_usage_document_idx on public.api_usage(document_id);
alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;
grant all on public.api_usage to service_role;
