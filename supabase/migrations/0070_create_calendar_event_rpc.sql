-- Create a planner event and all selected attendees in one transaction.
-- A client must never observe a successful event insert followed by a failed
-- attendee insert, because retrying that partial write creates duplicates.

create or replace function public.create_calendar_event_with_attendees(
  p_family_id uuid,
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
  v_event public.calendar_events%rowtype;
  v_attendee_id uuid;
begin
  if not public.user_belongs_to_family(p_family_id) then
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
        and family_members.family_id = p_family_id
    )
  ) then
    raise exception 'invalid_attendee';
  end if;

  insert into public.calendar_events (
    family_id,
    title,
    note,
    starts_on,
    ends_on,
    all_day,
    starts_time,
    ends_time,
    recurrence,
    recurrence_until,
    recurrence_exceptions,
    location,
    responsible_member_id
  )
  values (
    p_family_id,
    p_title,
    nullif(p_note, ''),
    p_date,
    p_date,
    p_all_day,
    case when p_all_day then null else p_starts_time end,
    case when p_all_day then null else p_ends_time end,
    'none',
    null,
    '{}',
    nullif(p_location, ''),
    null
  )
  returning * into v_event;

  foreach v_attendee_id in array coalesce(p_attendee_ids, '{}'::uuid[])
  loop
    insert into public.calendar_event_attendees (
      event_id,
      family_member_id
    )
    values (
      v_event.id,
      v_attendee_id
    );
  end loop;

  return to_jsonb(v_event);
end;
$$;

revoke all on function public.create_calendar_event_with_attendees(
  uuid, text, text, date, boolean, time, time, text, uuid[]
) from public;

grant execute on function public.create_calendar_event_with_attendees(
  uuid, text, text, date, boolean, time, time, text, uuid[]
) to authenticated;
