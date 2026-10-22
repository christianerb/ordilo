-- 0094_growth_tracking_events.sql
--
-- Growth tracking: invites and daily app opens become product events.
--
-- * invite_created / invite_accepted are recorded by triggers, so every
--   path (web, native app, family merge) is covered without each client
--   having to remember an analytics call. Invited members always get the
--   role 'adult' or 'viewer'; the creator's own membership is 'owner' and
--   is not an accepted invite.
-- * app_opened is written by the clients at most once per day and user.
--
-- Events stay content-free: ids and the invite role only.
-- Idempotent: constraint, functions and triggers are dropped/replaced.

alter table public.product_events
  drop constraint if exists product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'onboarding_started',
    'onboarding_step_completed',
    'onboarding_completed',
    'onboarding_scan_started',
    'onboarding_entry_selected',
    'document_upload_succeeded',
    'document_upload_failed',
    'document_result_viewed',
    'document_confirmed',
    'document_next_step_selected',
    'search_completed',
    'chat_question_sent',
    'chat_answer_repair_started',
    'task_created',
    'task_completed',
    'calendar_event_created',
    'live_conversation_ended',
    'invite_created',
    'invite_accepted',
    'app_opened'
  ));

create or replace function public.record_invite_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.product_events (user_id, family_id, event_name, properties)
    values (
      new.created_by,
      new.family_id,
      'invite_created',
      jsonb_build_object('role', new.role, 'platform', 'unknown')
    );
  end if;
  return new;
exception when others then
  -- Analytics must never block creating or accepting an invite.
  return new;
end;
$$;

drop trigger if exists family_invites_record_created_event on public.family_invites;
create trigger family_invites_record_created_event
  after insert on public.family_invites
  for each row execute function public.record_invite_created_event();

create or replace function public.record_invite_accepted_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'owner' then
    insert into public.product_events (user_id, family_id, event_name, properties)
    values (
      new.user_id,
      new.family_id,
      'invite_accepted',
      jsonb_build_object('role', new.role, 'platform', 'unknown')
    );
  end if;
  return new;
exception when others then
  -- Analytics must never block creating or accepting an invite.
  return new;
end;
$$;

drop trigger if exists family_memberships_record_invite_accepted_event on public.family_memberships;
create trigger family_memberships_record_invite_accepted_event
  after insert on public.family_memberships
  for each row execute function public.record_invite_accepted_event();

-- Trigger functions are not meant to be called directly.
revoke execute on function public.record_invite_created_event() from public, anon, authenticated;
revoke execute on function public.record_invite_accepted_event() from public, anon, authenticated;
