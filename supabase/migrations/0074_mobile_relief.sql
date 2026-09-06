-- Device-scoped notification delivery, explicit task acceptance, and upload retry identity.
alter table public.documents add column if not exists upload_key text;
create unique index if not exists documents_upload_key_idx
  on public.documents(family_id, uploaded_by, upload_key) where upload_key is not null;

create table if not exists public.push_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (length(token) < 256),
  timezone text not null default 'Europe/Berlin',
  updated_at timestamptz not null default now()
);
alter table public.push_devices enable row level security;
-- Tokens are never returned to another client; authenticated routes own writes.
revoke all on public.push_devices from anon, authenticated;
grant all on public.push_devices to service_role;

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.push_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  event_key text not null,
  kind text not null check (kind in ('document_ready', 'document_failed', 'task_assigned', 'task_accepted', 'daily')),
  document_id uuid references public.documents(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'sending', 'ticket', 'sent', 'failed')),
  attempts integer not null default 0,
  retry_at timestamptz not null default now(),
  receipt_id text,
  created_at timestamptz not null default now(),
  unique(device_id, event_key)
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant all on public.push_deliveries to service_role;
create index if not exists push_deliveries_pending_idx on public.push_deliveries(retry_at) where state in ('pending', 'sending', 'ticket');

create or replace function public.claim_push_deliveries(p_limit integer default 50)
returns setof public.push_deliveries language plpgsql security definer set search_path = public as $$
begin
  update public.push_deliveries set state = 'failed'
    where state in ('pending', 'sending') and attempts >= 8 and retry_at <= now();
  return query
  update public.push_deliveries d set state = 'sending', attempts = attempts + 1, retry_at = now() + interval '5 minutes'
  where d.id in (
    select q.id from public.push_deliveries q
    where q.state in ('pending', 'sending') and q.retry_at <= now() and q.attempts < 8
    order by q.retry_at for update skip locked limit greatest(1, least(p_limit, 100))
  ) returning d.*;
end;
$$;
revoke all on function public.claim_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

create or replace function public.queue_document_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status or new.status not in ('analyzed', 'failed') then return new; end if;
  insert into public.push_deliveries(device_id, user_id, family_id, event_key, kind, document_id)
  select d.id, d.user_id, new.family_id, 'document:' || new.id || ':' || new.status,
    case when new.status = 'analyzed' then 'document_ready' else 'document_failed' end, new.id
  from public.push_devices d join public.family_memberships m on m.user_id = d.user_id and m.family_id = new.family_id
  on conflict(device_id, event_key) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_document_push() from public;
drop trigger if exists document_push on public.documents;
create trigger document_push after update of status on public.documents for each row execute function public.queue_document_push();

create table if not exists public.task_acceptances (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now()
);
alter table public.task_acceptances enable row level security;
drop policy if exists task_acceptances_read on public.task_acceptances;
create policy task_acceptances_read on public.task_acceptances for select to authenticated using (public.user_belongs_to_family(family_id));
grant select on public.task_acceptances to authenticated;
revoke insert, update, delete on public.task_acceptances from anon, authenticated;

create or replace function public.accept_family_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks; person public.family_members;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or not public.user_belongs_to_family(t.family_id) or t.status <> 'open' or not t.confirmed then
    raise exception 'Aufgabe nicht verfügbar';
  end if;
  select * into person from public.family_members where id = t.assigned_to and family_id = t.family_id and linked_user_id = auth.uid();
  if not found then raise exception 'Nur die zugewiesene Person kann übernehmen'; end if;
  insert into public.task_acceptances(task_id, family_id, member_id, user_id)
    values(t.id, t.family_id, person.id, auth.uid()) on conflict(task_id) do nothing;
  if found then
    insert into public.push_deliveries(device_id, user_id, family_id, event_key, kind, task_id)
    select d.id, d.user_id, t.family_id, 'accepted:' || t.id || ':' || txid_current(), 'task_accepted', t.id
    from public.push_devices d join public.family_memberships m on m.user_id = d.user_id and m.family_id = t.family_id
    where d.user_id <> auth.uid() on conflict(device_id, event_key) do nothing;
  end if;
end;
$$;
revoke all on function public.accept_family_task(uuid) from public, anon;
grant execute on function public.accept_family_task(uuid) to authenticated;

create or replace function public.queue_task_assignment_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  delete from public.task_acceptances where task_id = new.id;
  if new.assigned_to is null or new.status <> 'open' or not new.confirmed then return new; end if;
  insert into public.push_deliveries(device_id, user_id, family_id, event_key, kind, task_id)
  select d.id, d.user_id, new.family_id, 'assigned:' || new.id || ':' || txid_current(), 'task_assigned', new.id
  from public.push_devices d join public.family_members p on p.linked_user_id = d.user_id
  join public.family_memberships m on m.user_id = d.user_id and m.family_id = new.family_id
  where p.id = new.assigned_to and p.family_id = new.family_id and d.user_id is distinct from auth.uid()
  on conflict(device_id, event_key) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_task_assignment_push() from public;
drop trigger if exists task_assignment_push on public.tasks;
create trigger task_assignment_push after insert or update of assigned_to on public.tasks for each row execute function public.queue_task_assignment_push();
