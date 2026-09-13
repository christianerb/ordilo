-- 0084_family_activity_view.sql
--
-- family_activity: one UNION ALL feed of recent family events for the
-- "Neuigkeiten" section. security_invoker, so every caller only sees their
-- own family's rows through the existing table RLS. Ordering and limiting
-- are the client's job.
--
-- Column contract (same for every row, in this order):
--   activity_id text        -- stable unique key, e.g. 'document:<uuid>'
--   family_id   uuid
--   kind        text        -- document | task | event | email | member
--   title       text        -- human-readable title
--   detail      text        -- short context, nullable
--   occurred_at timestamptz -- the meaningful timestamp
--   ref_id      uuid        -- underlying row id for navigation, nullable
--
-- Member rows come from family_members (person profiles with a name);
-- family_memberships has no display name and auth.users is not readable
-- from a security_invoker view.

create or replace view public.family_activity
with (security_invoker = true) as

-- Document uploaded
select
  'document:' || d.id::text as activity_id,
  d.family_id,
  'document'                as kind,
  coalesce(nullif(d.title, ''), d.original_filename, 'Dokument') as title,
  d.status                  as detail,
  d.created_at              as occurred_at,
  d.id                      as ref_id
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
  t.id
from public.tasks t

union all

-- Task completed
select
  'task:done:' || t.id::text,
  t.family_id,
  'task',
  t.title,
  'erledigt',
  t.completed_at,
  t.id
from public.tasks t
where t.completed_at is not null

union all

-- Calendar event created
select
  'event:' || e.id::text,
  e.family_id,
  'event',
  e.title,
  to_char(e.starts_on, 'DD.MM.YYYY'),
  e.created_at,
  e.id
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
  m.id
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
  p.id
from public.family_members p;

grant select on public.family_activity to authenticated;
