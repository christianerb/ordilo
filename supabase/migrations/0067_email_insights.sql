-- Short inbound family addresses, plus the "Ordilo read your email" surface:
-- a stored copy of a plain inbound email and the appointments/tasks Ordilo
-- proposes from it. Nothing is written to the calendar or the task list
-- without the family confirming it in the app.

-- ---------------------------------------------------------------------------
-- Short, unguessable inbound codes
-- ---------------------------------------------------------------------------

-- Crockford-style base32 (no i/l/o/u, so a code can be read aloud and typed
-- without ambiguity). Ten characters carry 50 bits, drawn from a UUID's
-- random bytes; 256 is divisible by 32, so the mapping stays uniform.
create or replace function public.generate_inbound_email_local_part()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  source text := replace(gen_random_uuid()::text, '-', '');
  code text := '';
  position int;
begin
  for position in 0..9 loop
    code := code || substr(
      alphabet,
      (('x' || substr(source, position * 2 + 1, 2))::bit(8)::int % 32) + 1,
      1
    );
  end loop;
  return 'post-' || code;
end;
$$;

revoke all on function public.generate_inbound_email_local_part() from public;

-- The old 32-hex `dokumente+…` form stays valid so an address a family has
-- already saved in their mail client keeps working.
alter table public.family_email_aliases
  drop constraint if exists family_email_aliases_local_part_check;
alter table public.family_email_aliases
  add constraint family_email_aliases_local_part_check
  check (
    local_part ~ '^post-[0-9abcdefghjkmnpqrstvwxyz]{10}$'
    or local_part ~ '^dokumente\+[a-f0-9]{32}$'
  );

create or replace function public.assign_family_email_alias(p_family_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing text;
  candidate text;
  attempt int := 0;
begin
  select local_part into existing
  from public.family_email_aliases
  where family_id = p_family_id;
  if existing is not null then
    return existing;
  end if;

  loop
    attempt := attempt + 1;
    candidate := public.generate_inbound_email_local_part();
    begin
      insert into public.family_email_aliases (family_id, local_part)
      values (p_family_id, candidate);
      return candidate;
    exception
      when unique_violation then
        -- Either a concurrent transaction created the alias for this family,
        -- or the code itself collided. The first case is done, the second
        -- deserves another draw.
        select local_part into existing
        from public.family_email_aliases
        where family_id = p_family_id;
        if existing is not null then
          return existing;
        end if;
        if attempt >= 8 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.assign_family_email_alias(uuid) from public;

create or replace function public.create_family_email_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assign_family_email_alias(new.id);
  return new;
end;
$$;

revoke all on function public.create_family_email_alias() from public;

drop trigger if exists create_family_email_alias_on_family on public.families;
create trigger create_family_email_alias_on_family
after insert on public.families
for each row execute function public.create_family_email_alias();

-- Families created before the trigger existed (or while it was broken).
do $$
declare
  family record;
begin
  for family in
    select f.id
    from public.families f
    left join public.family_email_aliases a on a.family_id = f.id
    where a.family_id is null
  loop
    perform public.assign_family_email_alias(family.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The stored copy of a plain inbound email
-- ---------------------------------------------------------------------------

-- A row exists only when Ordilo actually found something worth proposing —
-- an email it could make nothing of leaves no trace. `retention` records the
-- family's answer to "behalten oder löschen?"; on 'deleted' the readable
-- fields are emptied in the same statement.
create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  source_email_id text not null unique,
  from_address text not null default '',
  subject text not null default '',
  body_text text,
  received_at timestamptz not null default now(),
  retention text not null default 'pending'
    check (retention in ('pending', 'kept', 'deleted')),
  retention_decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.inbound_emails enable row level security;

create index if not exists inbound_emails_family_idx
  on public.inbound_emails (family_id, received_at desc);

drop policy if exists "inbound_emails_select" on public.inbound_emails;
create policy "inbound_emails_select" on public.inbound_emails
  for select using (public.user_belongs_to_family(family_id));

-- ---------------------------------------------------------------------------
-- What Ordilo proposes from that email
-- ---------------------------------------------------------------------------

create table if not exists public.inbound_suggestions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  inbound_email_id uuid not null
    references public.inbound_emails(id) on delete cascade,
  kind text not null check (kind in ('calendar_event', 'task')),
  title text not null,
  starts_on date,
  starts_time time,
  ends_time time,
  location text,
  note text,
  confidence real not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),
  created_calendar_event_id uuid
    references public.calendar_events(id) on delete set null,
  created_task_id uuid references public.tasks(id) on delete set null,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.inbound_suggestions enable row level security;

create index if not exists inbound_suggestions_family_pending_idx
  on public.inbound_suggestions (family_id, created_at desc)
  where status = 'pending';

drop policy if exists "inbound_suggestions_select" on public.inbound_suggestions;
create policy "inbound_suggestions_select" on public.inbound_suggestions
  for select using (public.user_belongs_to_family(family_id));

-- ---------------------------------------------------------------------------
-- Deciding on a proposal
-- ---------------------------------------------------------------------------

-- Writes are RPC-only: a plain update policy would let a client rewrite the
-- title it was shown and then have the server create that instead. Accepting
-- creates the row and stamps the suggestion in one transaction, so a retried
-- tap can never produce a second event.
create or replace function public.accept_inbound_suggestion(p_suggestion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion public.inbound_suggestions;
  created_id uuid;
begin
  select * into suggestion
  from public.inbound_suggestions
  where id = p_suggestion_id
  for update;

  if suggestion.id is null then
    raise exception 'Vorschlag nicht gefunden.';
  end if;
  if not public.user_belongs_to_family(suggestion.family_id) then
    raise exception 'Kein Zugriff auf diesen Vorschlag.';
  end if;
  if suggestion.status <> 'pending' then
    return coalesce(
      suggestion.created_calendar_event_id,
      suggestion.created_task_id
    );
  end if;

  if suggestion.kind = 'calendar_event' then
    insert into public.calendar_events (
      family_id, title, note, starts_on, ends_on, all_day,
      starts_time, ends_time, location, recurrence,
      recurrence_exceptions, created_by
    )
    values (
      suggestion.family_id,
      suggestion.title,
      suggestion.note,
      coalesce(suggestion.starts_on, current_date),
      -- The end lands on the next day when the (possibly defaulted) end
      -- time wraps past midnight, e.g. 23:30 with a one-hour default end.
      coalesce(suggestion.starts_on, current_date) + case
        when suggestion.starts_time is not null
          and coalesce(
            suggestion.ends_time,
            suggestion.starts_time + interval '1 hour'
          ) <= suggestion.starts_time
        then 1
        else 0
      end,
      suggestion.starts_time is null,
      suggestion.starts_time,
      case
        when suggestion.starts_time is null then null
        else coalesce(
          suggestion.ends_time,
          suggestion.starts_time + interval '1 hour'
        )
      end,
      suggestion.location,
      'none',
      '{}',
      auth.uid()
    )
    returning id into created_id;

    update public.inbound_suggestions
    set status = 'accepted',
        created_calendar_event_id = created_id,
        decided_at = now(),
        decided_by = auth.uid()
    where id = suggestion.id;
  else
    insert into public.tasks (
      family_id, title, description, due_date, status, confidence, confirmed
    )
    values (
      suggestion.family_id,
      suggestion.title,
      suggestion.note,
      suggestion.starts_on,
      'open',
      suggestion.confidence,
      true
    )
    returning id into created_id;

    update public.inbound_suggestions
    set status = 'accepted',
        created_task_id = created_id,
        decided_at = now(),
        decided_by = auth.uid()
    where id = suggestion.id;
  end if;

  return created_id;
end;
$$;

revoke all on function public.accept_inbound_suggestion(uuid) from public;
grant execute on function public.accept_inbound_suggestion(uuid) to authenticated;

create or replace function public.dismiss_inbound_suggestion(p_suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_family uuid;
begin
  select family_id into target_family
  from public.inbound_suggestions
  where id = p_suggestion_id;

  if target_family is null then
    raise exception 'Vorschlag nicht gefunden.';
  end if;
  if not public.user_belongs_to_family(target_family) then
    raise exception 'Kein Zugriff auf diesen Vorschlag.';
  end if;

  update public.inbound_suggestions
  set status = 'dismissed',
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_suggestion_id
    and status = 'pending';
end;
$$;

revoke all on function public.dismiss_inbound_suggestion(uuid) from public;
grant execute on function public.dismiss_inbound_suggestion(uuid) to authenticated;

-- "Löschen" has to mean it: the readable copy is gone in the same statement
-- that records the decision, and an already-created event keeps standing on
-- its own.
create or replace function public.decide_inbound_email_retention(
  p_inbound_email_id uuid,
  p_keep boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.inbound_emails;
begin
  -- Lock the row first: two family members can answer the keep-or-delete
  -- question at the same time, and the first answer must win. Without the
  -- lock a slower "Behalten" could overwrite a committed "Löschen" and mark
  -- an already-erased email as kept.
  select * into target
  from public.inbound_emails
  where id = p_inbound_email_id
  for update;

  if target.id is null then
    raise exception 'E-Mail nicht gefunden.';
  end if;
  if not public.user_belongs_to_family(target.family_id) then
    raise exception 'Kein Zugriff auf diese E-Mail.';
  end if;
  -- Already decided — the first answer stands and this call is a no-op.
  if target.retention <> 'pending' then
    return;
  end if;

  update public.inbound_emails
  set retention = case when p_keep then 'kept' else 'deleted' end,
      retention_decided_at = now(),
      body_text = case when p_keep then body_text else null end,
      subject = case when p_keep then subject else '' end,
      from_address = case when p_keep then from_address else '' end
  where id = p_inbound_email_id
    and retention = 'pending';

  -- Suggestions are derived from this email too. A calendar event or task
  -- already accepted by the family is its own record, so deleting these
  -- proposal rows cannot undo it.
  if not p_keep then
    delete from public.inbound_suggestions
    where inbound_email_id = p_inbound_email_id;
  end if;
end;
$$;

revoke all on function public.decide_inbound_email_retention(uuid, boolean) from public;
grant execute on function public.decide_inbound_email_retention(uuid, boolean) to authenticated;
