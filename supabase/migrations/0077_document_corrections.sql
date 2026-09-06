-- Optimistic, atomic corrections across document metadata and its consequences.
alter table public.documents add column if not exists corrections_text text;

-- Invoker rights keep every read/write under the caller's existing RLS policies.
create or replace function public.document_correction_revision(p_document_id uuid)
returns text language sql stable security invoker set search_path = public as $$
  select md5(jsonb_build_object(
    'document', to_jsonb(d),
    'entities', (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]') from extracted_entities e where e.document_id = d.id),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from tasks t where t.document_id = d.id),
    'facts', (select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]') from document_facts f where f.document_id = d.id),
    'events', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from calendar_events c where c.document_id = d.id)
  )::text)
  from documents d where d.id = p_document_id and d.status = 'confirmed';
$$;
revoke all on function public.document_correction_revision(uuid) from public, anon;
grant execute on function public.document_correction_revision(uuid) to authenticated;

create or replace function public.correct_confirmed_document(p_update jsonb, p_corrections jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (p_update->>'p_document_id')::uuid;
  v_family uuid;
  v_item jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_update) is distinct from 'object'
    or jsonb_typeof(p_corrections) is distinct from 'object'
    or jsonb_typeof(p_corrections->'revision') is distinct from 'string'
    or coalesce(length(p_corrections->>'revision'), 0) = 0
    or jsonb_typeof(p_corrections->'tasks') is distinct from 'array'
    or jsonb_typeof(p_corrections->'facts') is distinct from 'array'
    or jsonb_typeof(p_corrections->'date_changes') is distinct from 'array'
    or jsonb_typeof(p_update->'p_entities') is distinct from 'array'
    or p_update->>'p_family_id' is null then
    raise exception 'Invalid correction payload' using errcode = '22023';
  end if;
  select family_id into v_family from documents where id = v_id and status = 'confirmed' for update;
  if v_family is null or v_family <> (p_update->>'p_family_id')::uuid then
    raise exception 'Document unavailable' using errcode = '42501';
  end if;
  perform 1 from tasks where document_id = v_id for update;
  perform 1 from document_facts where document_id = v_id for update;
  perform 1 from calendar_events where document_id = v_id for update;
  perform 1 from extracted_entities where document_id = v_id for update;
  if document_correction_revision(v_id) is distinct from p_corrections->>'revision' then
    raise exception 'Document changed' using errcode = '40001';
  end if;

  -- IDs must belong to this document. Never turn an arbitrary ID into an insert.
  for v_item in select value from jsonb_array_elements(p_corrections->'tasks') loop
    if v_item->>'id' is not null and not exists (
      select 1 from tasks where id = (v_item->>'id')::uuid and document_id = v_id
    ) then raise exception 'Invalid task' using errcode = '42501'; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_corrections->'facts') loop
    if v_item->>'id' is not null and not exists (
      select 1 from document_facts where id = (v_item->>'id')::uuid and document_id = v_id
    ) then raise exception 'Invalid fact' using errcode = '42501'; end if;
  end loop;

  -- Only untouched one-day, all-day events that still match the old extracted
  -- date follow a correction. Independently edited planner events stay intact.
  -- One statement evaluates every match against the original event values.
  -- Sequential updates would let A→B accidentally match a later B→C change.
  update calendar_events c set title = x.value->>'label',
    starts_on = (x.value->>'date')::date, ends_on = (x.value->>'date')::date
  from jsonb_array_elements(p_corrections->'date_changes') x(value)
  where c.document_id = v_id and c.family_id = v_family
    and coalesce(c.title, '') = coalesce(x.value->>'previous_label', '')
    and c.starts_on = (x.value->>'previous_date')::date and c.ends_on = c.starts_on
    and c.all_day and c.recurrence = 'none'
    and exists (select 1 from extracted_entities e where e.document_id = v_id
      and e.entity_type = 'date' and e.entity_value = x.value->>'previous_date'
      and coalesce(e.label, '') = coalesce(x.value->>'previous_label', ''));

  v_result := update_confirmed_document(
    v_id, v_family, p_update->>'p_title', p_update->>'p_summary',
    p_update->>'p_document_type', p_update->>'p_category',
    p_update->'p_persons', p_update->'p_organizations', p_update->'p_embeddings',
    p_update->'p_label_embeddings', p_update->'p_entities',
    (p_update->>'p_pipeline_version')::int
  );
  if v_result->>'status' is distinct from 'updated' then raise exception 'Document changed' using errcode = '40001'; end if;

  delete from tasks where document_id = v_id and not exists (
    select 1 from jsonb_array_elements(p_corrections->'tasks') x where x->>'id' = tasks.id::text
  );
  for v_item in select value from jsonb_array_elements(p_corrections->'tasks') loop
    if v_item->>'id' is not null then
      update tasks set title = v_item->>'title', due_date = (v_item->>'due_date')::date,
        confidence = 1, confirmed = true
        where id = (v_item->>'id')::uuid and document_id = v_id;
      -- Status, completion time, acceptance and assignee deliberately survive.
    else
      insert into tasks (document_id, family_id, title, due_date, confidence, confirmed)
      values (v_id, v_family, v_item->>'title', (v_item->>'due_date')::date, 1, true);
    end if;
  end loop;
  delete from document_facts where document_id = v_id and not exists (
    select 1 from jsonb_array_elements(p_corrections->'facts') x where x->>'id' = document_facts.id::text
  );
  for v_item in select value from jsonb_array_elements(p_corrections->'facts') loop
    if v_item->>'id' is not null then
      update document_facts set label = v_item->>'label', value = v_item->>'value',
        normalized_value = v_item->>'normalized_value', confidence = 1, confirmed = true
        where id = (v_item->>'id')::uuid and document_id = v_id;
    else
      insert into document_facts (document_id, family_id, fact_type, label, value, normalized_value, confidence, confirmed)
      values (v_id, v_family, 'identifier', v_item->>'label', v_item->>'value', v_item->>'normalized_value', 1, true);
    end if;
  end loop;
  update documents set tags = array(
    select distinct x->>'entity_value' from jsonb_array_elements(p_update->'p_entities') x
    where x->>'entity_type' = 'tag' and nullif(x->>'entity_value', '') is not null
  ), corrections_text = 'Familienkorrektur'
    where id = v_id;
  return v_result;
end;
$$;
revoke all on function public.correct_confirmed_document(jsonb, jsonb) from public, anon;
grant execute on function public.correct_confirmed_document(jsonb, jsonb) to authenticated;


-- Derive evidence from current rows, so later edits in the web app cannot leave
-- an obsolete snapshot overriding current tasks, facts, names or dates.
create or replace function public.document_correction_evidence(p_document_id uuid)
returns text language sql stable security invoker set search_path = public as $$
  select 'Aktueller gespeicherter Stand nach Familienkorrektur: ' || coalesce(d.title, '') || E'\n'
    || coalesce(d.summary, '') || E'\n'
    || coalesce((select string_agg(coalesce(e.label, e.entity_type, '') || ': ' || coalesce(e.entity_value, ''), E'\n' order by e.id)
      from extracted_entities e where e.document_id = d.id), '') || E'\n'
    || coalesce((select string_agg(t.title || coalesce(' — bis ' || t.due_date::text, '') || ' (' || t.status || ')', E'\n' order by t.id)
      from tasks t where t.document_id = d.id), '') || E'\n'
    || coalesce((select string_agg(f.label || ': ' || f.value, E'\n' order by f.id)
      from document_facts f where f.document_id = d.id), '')
  from documents d where d.id = p_document_id and d.corrections_text is not null;
$$;
revoke all on function public.document_correction_evidence(uuid) from public, anon;
grant execute on function public.document_correction_evidence(uuid) to authenticated;
