-- Scan failures reported by the mobile app become a first-party product
-- event, so quality monitoring also sees uploads that never reached the
-- server (no documents row exists for those). Properties carry only coarse
-- codes (stage, reason) — never filenames or content. Idempotent: drop and
-- re-add the constraint with the full list from 0075 plus the new name.
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
    'calendar_event_created'
  ));
