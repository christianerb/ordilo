-- Keep answer quality state and the single suggested follow-up across reloads.
alter table public.chat_messages
  add column if not exists response_state text not null default 'answered',
  add column if not exists suggestion jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_response_state_check'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_response_state_check
      check (response_state in ('answered', 'partial', 'conflict', 'not_found'));
  end if;
end
$$;

-- Extend the privacy-safe product event allow-list with answer repair.
alter table public.product_events
  drop constraint if exists product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'onboarding_started',
    'onboarding_step_completed',
    'onboarding_completed',
    'onboarding_scan_started',
    'document_upload_succeeded',
    'document_confirmed',
    'search_completed',
    'chat_question_sent',
    'chat_answer_repair_started',
    'task_created',
    'task_completed',
    'calendar_event_created'
  ));
