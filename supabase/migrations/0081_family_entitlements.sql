-- Provider-neutral family plans, effective entitlements, and monthly quotas.
--
-- Downgrades never delete or hide family data. An expired trial/subscription
-- resolves to `free`; existing documents remain readable, while only new
-- cost-producing operations are checked against the free plan's quota.
-- Daily anti-abuse limits remain separate and continue to apply to all plans.

create table if not exists public.billing_plans (
  code text primary key,
  display_name text not null,
  is_paid boolean not null,
  created_at timestamptz not null default now(),
  constraint billing_plans_code_check check (code in ('free', 'founding', 'plus'))
);

insert into public.billing_plans (code, display_name, is_paid)
values
  ('free', 'Free', false),
  ('founding', 'Founding', true),
  ('plus', 'Plus', true)
on conflict (code) do update
set display_name = excluded.display_name,
    is_paid = excluded.is_paid;

create table if not exists public.billing_metrics (
  code text primary key,
  description text not null,
  period text not null default 'month',
  constraint billing_metrics_period_check check (period = 'month')
);

insert into public.billing_metrics (code, description)
values
  ('document_processing', 'New documents accepted for OCR and analysis'),
  ('chat_answer', 'New AI answer requests')
on conflict (code) do update set description = excluded.description;

create table if not exists public.billing_plan_limits (
  plan_code text not null references public.billing_plans(code) on delete cascade,
  metric_code text not null references public.billing_metrics(code) on delete cascade,
  monthly_limit bigint,
  updated_at timestamptz not null default now(),
  primary key (plan_code, metric_code),
  constraint billing_plan_limits_nonnegative check (
    monthly_limit is null or monthly_limit >= 0
  )
);

-- NULL means that the product plan has no monthly cap for the metric. It does
-- not disable the independent daily anti-abuse limits in application routes.
insert into public.billing_plan_limits (plan_code, metric_code, monthly_limit)
values
  ('free', 'document_processing', 10),
  ('free', 'chat_answer', 10),
  ('founding', 'document_processing', null),
  ('founding', 'chat_answer', null),
  ('plus', 'document_processing', null),
  ('plus', 'chat_answer', null)
on conflict (plan_code, metric_code) do nothing;

create table if not exists public.family_entitlements (
  family_id uuid primary key references public.families(id) on delete cascade,
  plan_code text not null default 'free'
    references public.billing_plans(code),
  status text not null default 'free',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now(),
  constraint family_entitlements_status_check check (
    status in ('free', 'trialing', 'active', 'past_due', 'canceled', 'expired')
  ),
  constraint family_entitlements_free_state_check check (
    status <> 'free' or plan_code = 'free'
  ),
  constraint family_entitlements_trial_check check (
    status <> 'trialing' or (plan_code <> 'free' and trial_ends_at is not null)
  ),
  constraint family_entitlements_paid_state_check check (
    status not in ('active', 'past_due') or plan_code <> 'free'
  ),
  constraint family_entitlements_provider_pair_check check (
    (provider is null and provider_subscription_id is null)
    or provider is not null
  )
);

create unique index if not exists family_entitlements_provider_subscription_idx
  on public.family_entitlements(provider, provider_subscription_id)
  where provider is not null and provider_subscription_id is not null;

insert into public.family_entitlements (family_id, plan_code, status)
select id, 'free', 'free'
from public.families
on conflict (family_id) do nothing;

create or replace function public.handle_family_entitlement_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.family_entitlements (family_id, plan_code, status)
  values (new.id, 'free', 'free')
  on conflict (family_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_family_entitlement_created on public.families;
create trigger on_family_entitlement_created
  after insert on public.families
  for each row execute function public.handle_family_entitlement_created();

create table if not exists public.family_usage_periods (
  family_id uuid not null references public.families(id) on delete cascade,
  metric_code text not null references public.billing_metrics(code),
  period_start date not null,
  period_end date not null,
  used bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (family_id, metric_code, period_start),
  constraint family_usage_periods_nonnegative check (used >= 0),
  constraint family_usage_periods_ordered check (period_end > period_start)
);

create table if not exists public.family_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  metric_code text not null references public.billing_metrics(code),
  plan_code text not null references public.billing_plans(code),
  operation_key text not null,
  amount bigint not null,
  period_start date not null,
  allowed boolean not null default false,
  used_after bigint,
  limit_at_reservation bigint,
  created_at timestamptz not null default now(),
  unique (family_id, metric_code, period_start, operation_key),
  constraint family_usage_reservations_amount_check check (amount > 0),
  constraint family_usage_reservations_key_check check (
    length(operation_key) between 1 and 200
  )
);

create index if not exists family_usage_reservations_period_idx
  on public.family_usage_reservations(family_id, metric_code, period_start);

-- Billing payloads are deliberately not stored. The fingerprint lets an
-- operator compare a retry without retaining payment/customer payload data.
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  family_id uuid references public.families(id) on delete set null,
  payload_sha256 text,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, provider_event_id),
  constraint billing_events_provider_check check (length(provider) between 1 and 80),
  constraint billing_events_event_id_check check (length(provider_event_id) between 1 and 200),
  constraint billing_events_payload_hash_check check (
    payload_sha256 is null or payload_sha256 ~ '^[0-9a-f]{64}$'
  )
);

alter table public.billing_plans enable row level security;
alter table public.billing_metrics enable row level security;
alter table public.billing_plan_limits enable row level security;
alter table public.family_entitlements enable row level security;
alter table public.family_usage_periods enable row level security;
alter table public.family_usage_reservations enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.billing_plans from public, anon, authenticated;
revoke all on public.billing_metrics from public, anon, authenticated;
revoke all on public.billing_plan_limits from public, anon, authenticated;
revoke all on public.family_entitlements from public, anon, authenticated;
revoke all on public.family_usage_periods from public, anon, authenticated;
revoke all on public.family_usage_reservations from public, anon, authenticated;
revoke all on public.billing_events from public, anon, authenticated;
grant all on public.billing_plans to service_role;
grant all on public.billing_metrics to service_role;
grant all on public.billing_plan_limits to service_role;
grant all on public.family_entitlements to service_role;
grant all on public.family_usage_periods to service_role;
grant all on public.family_usage_reservations to service_role;
grant all on public.billing_events to service_role;

-- Internal resolver. A cancellation scheduled for period end stays `active`
-- with cancel_at_period_end=true until that paid period expires. `past_due`
-- retains paid access only through an explicit grace window.
create or replace function public.resolve_family_entitlement(
  p_family_id uuid,
  p_at timestamptz default now()
)
returns table (
  effective_plan_code text,
  entitlement_status text,
  access_ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when e.status = 'trialing' and e.trial_ends_at > p_at then e.plan_code
      when e.status = 'active'
        and (e.current_period_ends_at is null or e.current_period_ends_at > p_at)
        then e.plan_code
      when e.status = 'past_due' and e.grace_ends_at > p_at then e.plan_code
      else 'free'
    end,
    e.status,
    case
      when e.status = 'trialing' then e.trial_ends_at
      when e.status = 'past_due' then e.grace_ends_at
      when e.status = 'active' then e.current_period_ends_at
      else null
    end
  from public.family_entitlements e
  where e.family_id = p_family_id
$$;

create or replace function public.get_family_entitlement(
  p_family_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_access_ends_at timestamptz;
  v_limits jsonb;
begin
  if not public.user_belongs_to_family(p_family_id) then
    return null;
  end if;

  select effective_plan_code, entitlement_status, access_ends_at
    into v_plan, v_status, v_access_ends_at
  from public.resolve_family_entitlement(p_family_id, p_at);

  if v_plan is null then
    return null;
  end if;

  select coalesce(jsonb_object_agg(metric_code, monthly_limit), '{}'::jsonb)
    into v_limits
  from public.billing_plan_limits
  where plan_code = v_plan;

  return jsonb_build_object(
    'family_id', p_family_id,
    'plan', v_plan,
    'status', v_status,
    'access_ends_at', v_access_ends_at,
    'limits', v_limits
  );
end;
$$;

-- Service-side counterpart to get_family_entitlement. This deliberately has
-- no auth.uid() check because service-role requests do not carry an end-user
-- JWT. It is never executable by authenticated or anonymous clients.
create or replace function public.get_family_entitlement_admin(
  p_family_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_access_ends_at timestamptz;
  v_limits jsonb;
begin
  select effective_plan_code, entitlement_status, access_ends_at
    into v_plan, v_status, v_access_ends_at
  from public.resolve_family_entitlement(p_family_id, p_at);

  if v_plan is null then
    return null;
  end if;

  select coalesce(jsonb_object_agg(metric_code, monthly_limit), '{}'::jsonb)
    into v_limits
  from public.billing_plan_limits
  where plan_code = v_plan;

  return jsonb_build_object(
    'family_id', p_family_id,
    'plan', v_plan,
    'status', v_status,
    'access_ends_at', v_access_ends_at,
    'limits', v_limits
  );
end;
$$;

create or replace function public.reserve_family_usage(
  p_family_id uuid,
  p_metric_code text,
  p_amount bigint,
  p_operation_key text,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit bigint;
  v_period_start date :=
    date_trunc('month', p_at at time zone 'UTC')::date;
  v_period_end date :=
    (date_trunc('month', p_at at time zone 'UTC') + interval '1 month')::date;
  v_reservation public.family_usage_reservations%rowtype;
  v_used bigint;
begin
  if p_amount <= 0 then
    raise exception 'usage amount must be positive' using errcode = '22023';
  end if;
  if length(p_operation_key) not between 1 and 200 then
    raise exception 'operation key must contain 1 to 200 characters'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.families where id = p_family_id) then
    raise exception 'family does not exist' using errcode = '23503';
  end if;

  select effective_plan_code into v_plan
  from public.resolve_family_entitlement(p_family_id, p_at);

  select monthly_limit into v_limit
  from public.billing_plan_limits
  where plan_code = v_plan and metric_code = p_metric_code;

  if not found then
    raise exception 'metric is not configured for effective plan'
      using errcode = '22023';
  end if;

  -- Claim the operation before touching the aggregate. The unique key makes
  -- concurrent retries wait for and return the first transaction's result.
  insert into public.family_usage_reservations (
    family_id, metric_code, plan_code, operation_key, amount, period_start
  )
  values (
    p_family_id, p_metric_code, v_plan, p_operation_key, p_amount, v_period_start
  )
  on conflict (family_id, metric_code, period_start, operation_key) do nothing
  returning * into v_reservation;

  if not found then
    select * into v_reservation
    from public.family_usage_reservations
    where family_id = p_family_id
      and metric_code = p_metric_code
      and period_start = v_period_start
      and operation_key = p_operation_key
    for update;

    if v_reservation.amount <> p_amount then
      raise exception 'operation key was already used with a different amount'
        using errcode = '22023';
    end if;

    if v_reservation.allowed then
      return jsonb_build_object(
        'allowed', true,
        'duplicate', true,
        'plan', v_reservation.plan_code,
        'metric', p_metric_code,
        'used', v_reservation.used_after,
        'limit', v_reservation.limit_at_reservation,
        'period_start', v_reservation.period_start,
        'period_end', (v_reservation.period_start + interval '1 month')::date
      );
    end if;

    -- A rejected operation produced no billable work. Reevaluate it against
    -- current usage and entitlements so a later upgrade or released
    -- reservation can unblock a durable retry with the same operation key.
    delete from public.family_usage_reservations
    where id = v_reservation.id;

    insert into public.family_usage_reservations (
      family_id, metric_code, plan_code, operation_key, amount, period_start
    )
    values (
      p_family_id, p_metric_code, v_plan, p_operation_key, p_amount,
      v_period_start
    )
    returning * into v_reservation;
  end if;

  insert into public.family_usage_periods (
    family_id, metric_code, period_start, period_end, used
  )
  values (p_family_id, p_metric_code, v_period_start, v_period_end, 0)
  on conflict (family_id, metric_code, period_start) do nothing;

  -- The row lock serializes different operation keys for the same
  -- family/metric/month. Therefore concurrent requests cannot cross a limit.
  select used into v_used
  from public.family_usage_periods
  where family_id = p_family_id
    and metric_code = p_metric_code
    and period_start = v_period_start
  for update;

  if v_limit is not null and v_used + p_amount > v_limit then
    -- A rejected operation did not produce billable work. Do not persist its
    -- outcome, so the same durable key can be reevaluated after an upgrade or
    -- after another failed operation releases quota.
    delete from public.family_usage_reservations
    where id = v_reservation.id;

    return jsonb_build_object(
      'allowed', false,
      'duplicate', false,
      'plan', v_plan,
      'metric', p_metric_code,
      'used', v_used,
      'limit', v_limit,
      'period_start', v_period_start,
      'period_end', v_period_end
    );
  end if;

  update public.family_usage_periods
  set used = used + p_amount, updated_at = now()
  where family_id = p_family_id
    and metric_code = p_metric_code
    and period_start = v_period_start
  returning used into v_used;

  update public.family_usage_reservations
  set allowed = true, used_after = v_used, limit_at_reservation = v_limit
  where id = v_reservation.id;

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'plan', v_plan,
    'metric', p_metric_code,
    'used', v_used,
    'limit', v_limit,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
end;
$$;

-- Releases a failed cost-producing operation in the same atomic transaction
-- that decrements its monthly aggregate. Deleting the reservation lets the
-- same stable operation key reserve again on retry. Successful operations
-- are never released, even when answer persistence fails after delivery.
create or replace function public.release_family_usage(
  p_family_id uuid,
  p_metric_code text,
  p_operation_key text,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_start date :=
    date_trunc('month', p_at at time zone 'UTC')::date;
  v_reservation public.family_usage_reservations%rowtype;
begin
  select * into v_reservation
  from public.family_usage_reservations
  where family_id = p_family_id
    and metric_code = p_metric_code
    and period_start = v_period_start
    and operation_key = p_operation_key
  for update;

  if not found or not v_reservation.allowed then
    return false;
  end if;

  update public.family_usage_periods
  set used = greatest(0, used - v_reservation.amount), updated_at = now()
  where family_id = p_family_id
    and metric_code = p_metric_code
    and period_start = v_period_start;

  delete from public.family_usage_reservations
  where id = v_reservation.id;

  return true;
end;
$$;

create or replace function public.record_billing_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_family_id uuid default null,
  p_payload_sha256 text default null,
  p_occurred_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
begin
  insert into public.billing_events (
    provider, provider_event_id, event_type, family_id,
    payload_sha256, occurred_at
  )
  values (
    p_provider, p_provider_event_id, p_event_type, p_family_id,
    p_payload_sha256, p_occurred_at
  )
  on conflict (provider, provider_event_id) do nothing
  returning true into v_inserted;

  return coalesce(v_inserted, false);
end;
$$;

revoke all on function public.handle_family_entitlement_created() from public, anon, authenticated;
revoke all on function public.resolve_family_entitlement(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_family_entitlement(uuid, timestamptz) from public, anon;
revoke all on function public.get_family_entitlement_admin(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_family_usage(uuid, text, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.release_family_usage(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_billing_event(text, text, text, uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.get_family_entitlement(uuid, timestamptz) to authenticated;
grant execute on function public.resolve_family_entitlement(uuid, timestamptz) to service_role;
grant execute on function public.get_family_entitlement(uuid, timestamptz) to service_role;
grant execute on function public.get_family_entitlement_admin(uuid, timestamptz) to service_role;
grant execute on function public.reserve_family_usage(uuid, text, bigint, text, timestamptz) to service_role;
grant execute on function public.release_family_usage(uuid, text, text, timestamptz) to service_role;
grant execute on function public.record_billing_event(text, text, text, uuid, text, timestamptz) to service_role;

comment on table public.family_entitlements is
  'Server-owned billing state. Expired paid access resolves to free without deleting or hiding existing family data.';
comment on column public.billing_plan_limits.monthly_limit is
  'NULL means no product-level monthly cap; daily anti-abuse limits still apply.';
comment on function public.reserve_family_usage(uuid, text, bigint, text, timestamptz) is
  'Atomically reserves monthly usage. Stable operation keys make retries idempotent.';
comment on function public.release_family_usage(uuid, text, text, timestamptz) is
  'Atomically releases failed work and permits the same operation key to retry.';
