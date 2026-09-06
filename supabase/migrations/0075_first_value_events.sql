-- 0074 is reserved by the concurrent mobile-relief-intake workstream.
-- Choice, visible value and next action are distinct from successful upload
-- and confirmation. Keep legacy names so existing events remain valid.
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
    'document_result_viewed',
    'document_confirmed',
    'document_next_step_selected',
    'search_completed',
    'chat_question_sent',
    'chat_answer_repair_started',
    'task_created',
    'task_completed',
    'calendar_event_created'
  ));
