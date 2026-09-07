-- Write paths a planner event needed but did not have: change it, and
-- drop or restore a single day of a repeating series.
--
-- The native app could only create an appointment. Editing one with two
-- client calls (update the row, then replace the attendees) can leave an
-- event whose people no longer match what the family saw, so the write
-- goes through one transactional RPC — the mirror image of
-- create_calendar_event_with_attendees (0070).
--
-- Skipping a day is its own function for a different reason: the client
-- must never send a whole recurrence_exceptions array it read earlier.
-- Two family members skipping different days at once would then silently
-- undo each other. The array is changed in place instead.

create or replace function public.update_calendar_event_with_attendees(
  p_event_id uuid,
  p_title text,
  p_note text,
  p_date date,
  p_all_day boolean,
  p_starts_time time,
  p_ends_time time,
  p_location text,
  p_attendee_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family_id uuid;
  v_event public.calendar_events%rowtype;
  v_attendee_id uuid;
  v_duration integer;
begin
  select family_id, (ends_on - starts_on)
    into v_family_id, v_duration
  from public.calendar_events
  where id = p_event_id;

  -- Told apart on purpose: a caller can act on "already gone" (say so and
  -- stop) but not on "no access" (a bug or an attack). Collapsing both
  -- into one error left the client asking for a retry that cannot work.
  if v_family_id is null then
    raise exception 'not_found';
  end if;

  if not public.user_belongs_to_family(v_family_id) then
    raise exception 'not_authorized';
  end if;

  if not p_all_day and (
    p_starts_time is null
    or p_ends_time is null
    or p_ends_time <= p_starts_time
  ) then
    raise exception 'invalid_time_range';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_attendee_ids, '{}'::uuid[]))
      as attendee(attendee_id)
    where not exists (
      select 1
      from public.family_members
      where family_members.id = attendee.attendee_id
        and family_members.family_id = v_family_id
    )
  ) then
    raise exception 'invalid_attendee';
  end if;

  update public.calendar_events
  set
    title = p_title,
    note = nullif(p_note, ''),
    starts_on = p_date,
    -- A multi-day event keeps the span it had; moving it moves both ends.
    ends_on = p_date + coalesce(v_duration, 0),
    all_day = p_all_day,
    starts_time = case when p_all_day then null else p_starts_time end,
    ends_time = case when p_all_day then null else p_ends_time end,
    location = nullif(p_location, ''),
    -- Moving a series moves its whole window: the end travels with the
    -- start by the same number of days, and never lands before the new
    -- start. Otherwise an edit made on a phone — which shows the date but
    -- not the recurrence end — could push the start past the end and the
    -- appointment would occur on no day at all, disappearing everywhere
    -- with no way back from that phone.
    recurrence_until = case
      when recurrence_until is null then null
      else greatest(
        recurrence_until + (p_date - starts_on),
        p_date + coalesce(v_duration, 0)
      )
    end
  where id = p_event_id
  returning * into v_event;

  if not found then
    raise exception 'not_found';
  end if;

  delete from public.calendar_event_attendees
  where event_id = p_event_id
    and family_member_id <> all (coalesce(p_attendee_ids, '{}'::uuid[]));

  foreach v_attendee_id in array coalesce(p_attendee_ids, '{}'::uuid[])
  loop
    insert into public.calendar_event_attendees (event_id, family_member_id)
    values (p_event_id, v_attendee_id)
    on conflict (event_id, family_member_id) do nothing;
  end loop;

  return to_jsonb(v_event);
end;
$$;

revoke all on function public.update_calendar_event_with_attendees(
  uuid, text, text, date, boolean, time, time, text, uuid[]
) from public;

grant execute on function public.update_calendar_event_with_attendees(
  uuid, text, text, date, boolean, time, time, text, uuid[]
) to authenticated;

-- ---------------------------------------------------------------------------
-- One day out of a repeating series, and back in
-- ---------------------------------------------------------------------------

create or replace function public.skip_calendar_event_occurrence(
  p_event_id uuid,
  p_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family_id uuid;
  v_event public.calendar_events%rowtype;
begin
  select family_id into v_family_id
  from public.calendar_events
  where id = p_event_id;

  if v_family_id is null then
    raise exception 'not_found';
  end if;

  if not public.user_belongs_to_family(v_family_id) then
    raise exception 'not_authorized';
  end if;

  -- Appended in place, so a day skipped elsewhere in the meantime stays
  -- skipped. Idempotent: skipping the same day twice changes nothing.
  update public.calendar_events
  set recurrence_exceptions =
    case
      when p_date = any (recurrence_exceptions) then recurrence_exceptions
      else array_append(recurrence_exceptions, p_date)
    end
  where id = p_event_id
  returning * into v_event;

  -- to_jsonb of an unset rowtype is a non-null object of nulls, which a
  -- client cannot tell from a real row: an event deleted in the meantime
  -- would report success and leave the day on screen.
  if not found then
    raise exception 'not_found';
  end if;

  return to_jsonb(v_event);
end;
$$;

create or replace function public.restore_calendar_event_occurrence(
  p_event_id uuid,
  p_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family_id uuid;
  v_event public.calendar_events%rowtype;
begin
  select family_id into v_family_id
  from public.calendar_events
  where id = p_event_id;

  if v_family_id is null then
    raise exception 'not_found';
  end if;

  if not public.user_belongs_to_family(v_family_id) then
    raise exception 'not_authorized';
  end if;

  update public.calendar_events
  set recurrence_exceptions = array_remove(recurrence_exceptions, p_date)
  where id = p_event_id
  returning * into v_event;

  if not found then
    raise exception 'not_found';
  end if;

  return to_jsonb(v_event);
end;
$$;

revoke all on function public.skip_calendar_event_occurrence(uuid, date)
  from public;
revoke all on function public.restore_calendar_event_occurrence(uuid, date)
  from public;

grant execute on function public.skip_calendar_event_occurrence(uuid, date)
  to authenticated;
grant execute on function public.restore_calendar_event_occurrence(uuid, date)
  to authenticated;
