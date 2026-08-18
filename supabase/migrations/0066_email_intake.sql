-- Private family email aliases, inbound-email idempotency, and one-time
-- operator notifications for new auth users.

create table if not exists public.family_email_aliases (
  family_id uuid primary key references public.families(id) on delete cascade,
  local_part text not null unique
    check (local_part ~ '^dokumente\+[a-f0-9]{32}$'),
  created_at timestamptz not null default now()
);

alter table public.family_email_aliases enable row level security;

drop policy if exists "family_email_aliases_select" on public.family_email_aliases;
create policy "family_email_aliases_select" on public.family_email_aliases
  for select using (public.user_belongs_to_family(family_id));

create or replace function public.create_family_email_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.family_email_aliases (family_id, local_part)
  values (
    new.id,
    'dokumente+' || replace(gen_random_uuid()::text, '-', '')
  )
  on conflict (family_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_family_email_alias() from public;

drop trigger if exists create_family_email_alias_on_family on public.families;
create trigger create_family_email_alias_on_family
after insert on public.families
for each row execute function public.create_family_email_alias();

insert into public.family_email_aliases (family_id, local_part)
select id, 'dokumente+' || replace(gen_random_uuid()::text, '-', '')
from public.families
on conflict (family_id) do nothing;

alter table public.documents
  add column if not exists source_email_id text,
  add column if not exists source_attachment_id text,
  add column if not exists source_email_recipient text;

create unique index if not exists documents_inbound_attachment_idx
  on public.documents (source_email_id, source_attachment_id)
  where source_email_id is not null and source_attachment_id is not null;

create table if not exists public.inbound_email_notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_email text not null,
  kind text not null check (kind in ('received', 'failed')),
  source_email_id text not null,
  document_id uuid references public.documents(id) on delete cascade,
  document_count integer not null default 0 check (document_count >= 0),
  created_at timestamptz not null default now(),
  email_claimed_at timestamptz,
  email_sent_at timestamptz
);

alter table public.inbound_email_notifications enable row level security;

create unique index if not exists inbound_email_notifications_receipt_idx
  on public.inbound_email_notifications (source_email_id, recipient_email)
  where kind = 'received';

create unique index if not exists inbound_email_notifications_failure_idx
  on public.inbound_email_notifications (document_id, recipient_email)
  where kind = 'failed';

create table if not exists public.signup_notifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  email_claimed_at timestamptz,
  email_sent_at timestamptz
);

alter table public.signup_notifications enable row level security;

create or replace function public.queue_signup_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.signup_notifications (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.queue_signup_notification() from public;

drop trigger if exists queue_signup_notification_on_auth_user on auth.users;
create trigger queue_signup_notification_on_auth_user
after insert on auth.users
for each row execute function public.queue_signup_notification();
