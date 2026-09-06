-- Focused integration test of 0077 on a disposable PostgreSQL database.
-- The pre-existing graph/vector updater is stubbed: this exercises wrapper
-- authorization, conflict checks, synchronization and transaction boundaries.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/document_corrections.sql <connection>
begin;
create schema auth;
create role authenticated;
create role anon;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table documents (
 id uuid primary key, family_id uuid not null, status text, title text, summary text,
 document_type text, category text, corrections_text text, tags text[] not null default '{}'
);
create table extracted_entities (
 id uuid primary key default gen_random_uuid(), document_id uuid, family_id uuid,
 entity_type text, entity_value text, label text
);
create table tasks (
 id uuid primary key default gen_random_uuid(), document_id uuid, family_id uuid,
 title text not null, due_date date, confidence double precision default 0,
 confirmed boolean default false, status text default 'open', completed_at timestamptz,
 assigned_to uuid
);
create table document_facts (
 id uuid primary key default gen_random_uuid(), document_id uuid, family_id uuid,
 fact_type text not null, label text not null, value text not null, normalized_value text not null,
 confidence double precision default 0, confirmed boolean default false
);
create table calendar_events (
 id uuid primary key default gen_random_uuid(), document_id uuid, family_id uuid,
 title text not null, starts_on date, ends_on date, all_day boolean, recurrence text
);
-- Model the same family-scoped invoker RLS contract as production.
do $$ declare tab text; begin
 for tab in select unnest(array['documents','extracted_entities','tasks','document_facts','calendar_events']) loop
  execute format('alter table %I enable row level security', tab);
  execute format('create policy family_access on %I for all using (family_id = auth.uid()) with check (family_id = auth.uid())', tab);
 end loop;
end $$;
create function update_confirmed_document(
 p_document_id uuid, p_family_id uuid, p_title text, p_summary text, p_document_type text, p_category text,
 p_persons jsonb, p_organizations jsonb, p_embeddings jsonb, p_label_embeddings jsonb, p_entities jsonb, p_pipeline_version int
) returns jsonb language plpgsql security invoker as $$
begin
 update documents set title=p_title, summary=p_summary where id=p_document_id and status='confirmed';
 delete from extracted_entities where document_id=p_document_id;
 insert into extracted_entities(document_id,family_id,entity_type,entity_value,label)
 select p_document_id,p_family_id,x->>'entity_type',x->>'entity_value',x->>'label' from jsonb_array_elements(p_entities) x;
 return jsonb_build_object('status','updated');
end $$;
\ir ../migrations/0077_document_corrections.sql
\ir ../migrations/0077_document_corrections.sql
grant usage on schema public,auth to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;
insert into documents (id,family_id,status,title) values
 ('d0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','confirmed','Old title'),
 ('d0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000002','confirmed','Foreign title');
insert into tasks(id,document_id,family_id,title,status,completed_at,assigned_to) values
 ('a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Done task','done','2026-09-01 12:00:00+00','b0000000-0000-0000-0000-000000000001'),
 ('a0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000002','Foreign task','open',null,null);
insert into document_facts(id,document_id,family_id,fact_type,label,value,normalized_value) values
 ('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','policy_number','Policy','AB 12','ab12');
insert into extracted_entities(document_id,family_id,entity_type,entity_value,label) values
 ('d0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','date','2026-09-10','Deadline');
insert into calendar_events(id,document_id,family_id,title,starts_on,ends_on,all_day,recurrence) values
 ('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Deadline','2026-09-10','2026-09-10',true,'none'),
 ('e0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','My edited event','2026-09-10','2026-09-10',true,'none');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
do $$
declare
 doc uuid := 'd0000000-0000-0000-0000-000000000001';
 rev text;
 upd jsonb := '{"p_document_id":"d0000000-0000-0000-0000-000000000001","p_family_id":"f0000000-0000-0000-0000-000000000001","p_title":"Corrected title","p_summary":"Verified", "p_pipeline_version":1,"p_entities":[{"entity_type":"date","entity_value":"2026-09-12","label":"Corrected deadline"}]}';
 corrections jsonb := '{"tasks":[{"id":"a0000000-0000-0000-0000-000000000001","title":"Corrected task","due_date":"2026-09-12"}],"facts":[{"id":"c0000000-0000-0000-0000-000000000001","label":"Policy","value":"CD 34","normalized_value":"cd34"}],"date_changes":[{"previous_date":"2026-09-10","previous_label":"Deadline","date":"2026-09-12","label":"Corrected deadline"}]}';
 result jsonb;
 bad jsonb;
begin
 assert not has_function_privilege('anon','public.correct_confirmed_document(jsonb,jsonb)','execute'), 'anonymous can correct';
 assert document_correction_revision('d0000000-0000-0000-0000-000000000002') is null, 'foreign revision visible';
 rev := document_correction_revision(doc);
 corrections := corrections || jsonb_build_object('revision',rev);
 begin
  perform correct_confirmed_document(upd,corrections || '{"revision":"stale"}');
  raise exception 'Expected revision conflict';
 exception when serialization_failure then null; end;
 assert document_correction_revision(doc)=rev, 'conflict changed data';
 begin
  perform correct_confirmed_document(upd,corrections - 'facts');
  raise exception 'Expected malformed payload rejection';
 exception when invalid_parameter_value then null; end;
 assert document_correction_revision(doc)=rev, 'malformed payload deleted facts';
 begin
  perform correct_confirmed_document(upd || '{"p_document_id":"d0000000-0000-0000-0000-000000000002"}',corrections);
  raise exception 'Expected foreign document rejection';
 exception when insufficient_privilege then null; end;
 begin
  perform correct_confirmed_document(upd,corrections || '{"tasks":[{"id":"a0000000-0000-0000-0000-000000000002","title":"Attack"}]}');
  raise exception 'Expected foreign task rejection';
 exception when insufficient_privilege then null; end;
 assert document_correction_revision(doc)=rev, 'foreign ID changed data';
 -- Force a constraint failure AFTER the graph updater and event update run.
 bad := jsonb_set(corrections,'{facts,0,normalized_value}','null'::jsonb);
 begin
  perform correct_confirmed_document(upd,bad);
  raise exception 'Expected fact constraint rejection';
 exception when not_null_violation then null; end;
 assert document_correction_revision(doc)=rev, 'partial correction persisted after failure';
 result := correct_confirmed_document(upd,corrections);
 assert result->>'status'='updated', 'correction failed';
 assert (select title='Corrected title' and status='confirmed' from documents where id=doc), 'document status/title';
 assert (select status='done' and completed_at='2026-09-01 12:00:00+00'::timestamptz and assigned_to='b0000000-0000-0000-0000-000000000001'::uuid and title='Corrected task' and due_date='2026-09-12'::date from tasks where document_id=doc), 'task completion/assignee lost';
 assert (select normalized_value='cd34' and value='CD 34' and confirmed from document_facts where document_id=doc), 'fact normalization not saved';
 assert (select starts_on='2026-09-12'::date and ends_on=starts_on and title='Corrected deadline' from calendar_events where id='e0000000-0000-0000-0000-000000000001'), 'extracted date event stale';
 assert (select starts_on='2026-09-10'::date and title='My edited event' from calendar_events where id='e0000000-0000-0000-0000-000000000002'), 'edited planner event overwritten';
 assert document_correction_evidence(doc) like '%CD 34%' and document_correction_evidence(doc) like '%Corrected task%', 'chat correction evidence missing';
 update document_facts set value='Later web correction' where document_id=doc;
 assert document_correction_evidence(doc) like '%Later web correction%' and document_correction_evidence(doc) not like '%CD 34%', 'chat evidence retained stale snapshot';
 assert document_correction_revision(doc)<>rev, 'revision did not advance';
 -- Chain-shaped changes must not rematch an event already moved in this call.
 insert into extracted_entities(document_id,family_id,entity_type,entity_value,label) values
  (doc,'f0000000-0000-0000-0000-000000000001','date','2026-10-10','Chain'),
  (doc,'f0000000-0000-0000-0000-000000000001','date','2026-10-12','Chain');
 insert into calendar_events(id,document_id,family_id,title,starts_on,ends_on,all_day,recurrence) values
  ('e0000000-0000-0000-0000-000000000003',doc,'f0000000-0000-0000-0000-000000000001','Chain','2026-10-10','2026-10-10',true,'none'),
  ('e0000000-0000-0000-0000-000000000004',doc,'f0000000-0000-0000-0000-000000000001','Chain','2026-10-12','2026-10-12',true,'none');
 upd := upd || '{"p_entities":[{"entity_type":"tag","entity_value":"Versicherung"}]}';
 corrections := corrections || jsonb_build_object('revision',document_correction_revision(doc))
  || '{"date_changes":[{"previous_date":"2026-10-10","previous_label":"Chain","date":"2026-10-12","label":"Chain"},{"previous_date":"2026-10-12","previous_label":"Chain","date":"2026-10-14","label":"Chain"}]}';
 perform correct_confirmed_document(upd,corrections);
 assert (select starts_on='2026-10-12'::date from calendar_events where id='e0000000-0000-0000-0000-000000000003'), 'date change cascaded into second change';
 assert (select starts_on='2026-10-14'::date from calendar_events where id='e0000000-0000-0000-0000-000000000004'), 'second date change missing';
 assert (select tags=array['Versicherung'] from documents where id=doc), 'document tag index stale';
 assert document_correction_evidence('d0000000-0000-0000-0000-000000000002') is null, 'foreign correction evidence leaked';
end $$;
reset role;
rollback;
