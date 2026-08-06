-- 0043_document_partial_analysis.sql
--
-- Adds a `partial_analysis` column that the analyze pipeline step fills in
-- while the LLM extraction call is still streaming (title, category, first
-- persons/dates/tasks — whichever fields have already arrived). Realtime
-- already broadcasts every `documents` UPDATE (see 0033), so writing to
-- this column pushes a live, honest "still being reviewed" preview to the
-- scan wizard's processing step without any new subscription.
--
-- Always cleared back to NULL once the final `analyzed`/`confirmed` update
-- lands, so it never lingers as stale data.

alter table public.documents
  add column if not exists partial_analysis jsonb;

comment on column public.documents.partial_analysis is
  'Best-effort preview of the in-progress LLM extraction (title/category/persons/dates/tasks seen so far while status = analyzing). Null once analysis completes or fails.';
