-- 0091_family_activity_refinements.sql
--
-- Three feed refinements on top of 0084:
--
-- 1. Completed tasks leave the feed. A second row for finished work
--    announced what the Plan tab's own Erledigt section already says, so
--    the news read as redundant. Tasks appear once, when they are created.
--
-- 2. A document that is still being processed no longer shows its raw
--    camera-roll filename ("179007618975-…") as the headline. While the
--    pipeline is running and no title exists yet, the row says
--    "Neues Dokument" — the filename stays for finished and failed rows,
--    where it identifies the file.
--
-- 3. Task rows carry the document they were read from (tasks.document_id
--    is NOT NULL), so the app can open the subject of the news instead of
--    a management screen. The column is appended at the end, which
--    CREATE OR REPLACE VIEW allows without dropping dependents.
--
-- Column contract (same for every row, in this order):
--   activity_id text        -- stable unique key, e.g. 'document:<uuid>'
--   family_id   uuid
--   kind        text        -- document | task | event | email | member
--   title       text        -- human-readable title
--   detail      text        -- short context, nullable
--   occurred_at timestamptz -- the meaningful timestamp
--   ref_id      uuid        -- underlying row id, nullable
--   document_id uuid        -- the document the row is about, nullable
--
-- Idempotent: CREATE OR REPLACE VIEW with identical leading columns.

create or replace view public.family_activity
with (security_invoker = true) as

-- Document uploaded
select
  'document:' || d.id::text as activity_id,
  d.family_id,
  'document'                as kind,
  case
    when nullif(d.title, '') is not null then d.title
    when d.status in ('uploaded', 'ocr_processing', 'ocr_done', 'analyzing')
      then 'Neues Dokument'
    else coalesce(nullif(d.original_filename, ''), 'Dokument')
  end                       as title,
  d.status                  as detail,
  d.created_at              as occurred_at,
  d.id                      as ref_id,
  d.id                      as document_id
from public.documents d

union all

-- Task created
select
  'task:created:' || t.id::text,
  t.family_id,
  'task',
  t.title,
  null::text,
  t.created_at,
  t.id,
  t.document_id
from public.tasks t

union all

-- Calendar event created
select
  'event:' || e.id::text,
  e.family_id,
  'event',
  e.title,
  to_char(e.starts_on, 'DD.MM.YYYY'),
  e.created_at,
  e.id,
  null::uuid
from public.calendar_events e

union all

-- Inbound email received
select
  'email:' || m.id::text,
  m.family_id,
  'email',
  coalesce(nullif(m.subject, ''), nullif(m.from_address, ''), 'E-Mail'),
  nullif(m.from_address, ''),
  m.received_at,
  m.id,
  null::uuid
from public.inbound_emails m

union all

-- Family member (person profile) added
select
  'member:' || p.id::text,
  p.family_id,
  'member',
  p.name,
  'ist der Familie beigetreten',
  p.created_at,
  p.id,
  null::uuid
from public.family_members p;

grant select on public.family_activity to authenticated;
