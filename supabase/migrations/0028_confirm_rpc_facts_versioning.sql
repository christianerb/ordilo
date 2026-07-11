-- 0028_confirm_rpc_facts_versioning.sql
--
-- Recreates confirm_document with two additions:
--   - p_facts: typed document facts (see 0027) are replaced transactionally
--     alongside entities/tasks, with confirmed = true.
--   - p_pipeline_version: stamped on every inserted embedding row and on
--     documents.extraction_version (see 0026).
--
-- The old 12-parameter overload is dropped first — otherwise CREATE would
-- add a second overload and PostgREST rpc() calls become ambiguous.
--
-- Everything else is identical to 0017 (single-transaction confirm with
-- conditional analyzed→confirmed transition, node upserts, edge/embedding
-- replacement, entity/task replacement).

drop function if exists public.confirm_document(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
);

create or replace function public.confirm_document(
  p_document_id      uuid,
  p_family_id        uuid,
  p_title            text,
  p_summary          text,
  p_document_type    text,
  p_category         text,
  p_persons          jsonb default '[]'::jsonb,
  p_organizations    jsonb default '[]'::jsonb,
  p_embeddings       jsonb default '[]'::jsonb,
  p_label_embeddings jsonb default '[]'::jsonb,
  p_entities         jsonb default '[]'::jsonb,
  p_tasks            jsonb default '[]'::jsonb,
  p_facts            jsonb default '[]'::jsonb,
  p_pipeline_version int default 1
)
returns jsonb
language plpgsql
as $$
declare
  v_document_node_id uuid;
  v_person_node_id   uuid;
  v_org_node_id      uuid;
  v_person           jsonb;
  v_org              jsonb;
  v_emb              jsonb;
  v_entity           jsonb;
  v_task             jsonb;
  v_fact             jsonb;
  v_transitioned     int;
  v_label_emb        jsonb;
begin

  -- Build a temporary map of label → embedding from p_label_embeddings
  -- so we can set label_embedding on node inserts.
  create temp table if not exists tmp_label_embeddings (label text, embedding vector(1536));
  delete from tmp_label_embeddings;
  for v_label_emb in select * from jsonb_array_elements(p_label_embeddings)
  loop
    insert into tmp_label_embeddings (label, embedding)
    values (v_label_emb->>'label', (v_label_emb->>'embedding')::vector);
  end loop;

  -- 1. Conditional atomic transition: analyzed -> confirmed ----------------
  update public.documents
    set status             = 'confirmed',
        confirmed_at       = now(),
        title              = p_title,
        summary            = p_summary,
        document_type      = p_document_type,
        category           = p_category,
        extraction_version = p_pipeline_version,
        error_message      = null
    where id = p_document_id
      and status = 'analyzed';

  get diagnostics v_transitioned = row_count;

  if v_transitioned = 0 then
    return jsonb_build_object('status', 'status_changed');
  end if;

  -- 2. Clear prior graph/embedding state (idempotency) ---------------------
  delete from public.knowledge_edges
    where source_document_id = p_document_id;

  delete from public.document_embeddings
    where document_id = p_document_id;

  delete from public.knowledge_nodes
    where type = 'document'
      and properties_json->>'document_id' = p_document_id::text;

  -- 3. Create the document node --------------------------------------------
  insert into public.knowledge_nodes (family_id, type, label, properties_json, label_embedding)
  values (
    p_family_id,
    'document',
    coalesce(nullif(p_title, ''), 'Dokument'),
    jsonb_build_object('document_id', p_document_id),
    (select embedding from tmp_label_embeddings where label = coalesce(nullif(p_title, ''), 'Dokument') limit 1)
  )
  returning id into v_document_node_id;

  -- 4. UPSERT person nodes + create edges ----------------------------------
  for v_person in select * from jsonb_array_elements(p_persons)
  loop
    insert into public.knowledge_nodes (family_id, type, label, properties_json, label_embedding)
    values (
      p_family_id,
      'person',
      v_person->>'name',
      case
        when (v_person->>'person_id') is not null
          then jsonb_build_object('person_id', v_person->>'person_id')
        else '{}'::jsonb
      end,
      (select embedding from tmp_label_embeddings where label = v_person->>'name' limit 1)
    )
    on conflict (family_id, type, label)
      where type in ('person', 'organization')
    do update set label = excluded.label, label_embedding = coalesce(excluded.label_embedding, knowledge_nodes.label_embedding)
    returning id into v_person_node_id;

    insert into public.knowledge_edges (
      family_id, source_node_id, target_node_id, relation_type,
      confidence, source_document_id, confirmed
    )
    values (
      p_family_id,
      v_document_node_id,
      v_person_node_id,
      'mentions',
      coalesce((v_person->>'confidence')::double precision, 0.0),
      p_document_id,
      true
    );
  end loop;

  -- 5. UPSERT organization nodes + create edges ----------------------------
  for v_org in select * from jsonb_array_elements(p_organizations)
  loop
    insert into public.knowledge_nodes (family_id, type, label, properties_json, label_embedding)
    values (
      p_family_id,
      'organization',
      v_org->>'name',
      jsonb_build_object('organization_type', v_org->>'type'),
      (select embedding from tmp_label_embeddings where label = v_org->>'name' limit 1)
    )
    on conflict (family_id, type, label)
      where type in ('person', 'organization')
    do update set label = excluded.label, label_embedding = coalesce(excluded.label_embedding, knowledge_nodes.label_embedding)
    returning id into v_org_node_id;

    insert into public.knowledge_edges (
      family_id, source_node_id, target_node_id, relation_type,
      confidence, source_document_id, confirmed
    )
    values (
      p_family_id,
      v_document_node_id,
      v_org_node_id,
      'mentions',
      coalesce((v_org->>'confidence')::double precision, 0.0),
      p_document_id,
      true
    );
  end loop;

  -- 6. Insert precomputed embeddings (page provenance + pipeline version) --
  for v_emb in select * from jsonb_array_elements(p_embeddings)
  loop
    insert into public.document_embeddings (
      document_id, family_id, chunk_text, embedding, metadata_json,
      pipeline_version
    )
    values (
      p_document_id,
      p_family_id,
      v_emb->>'chunk_text',
      (v_emb->>'embedding')::vector,
      jsonb_build_object(
        'document_id',  p_document_id,
        'page_number',  coalesce((v_emb->>'page_number')::int, 1),
        'chunk_index',  coalesce((v_emb->>'chunk_index')::int, 0),
        'chunk_total',  coalesce((v_emb->>'chunk_total')::int, 0),
        'chunk_type',   coalesce(v_emb->>'chunk_type', 'chunk')
      ),
      p_pipeline_version
    );
  end loop;

  -- 7. Replace extracted_entities (confirmed = true) -----------------------
  delete from public.extracted_entities
    where document_id = p_document_id;

  for v_entity in select * from jsonb_array_elements(p_entities)
  loop
    insert into public.extracted_entities (
      document_id, family_id, entity_type, entity_value,
      normalized_value, confidence, confirmed, linked_object_id
    )
    values (
      p_document_id,
      p_family_id,
      v_entity->>'entity_type',
      v_entity->>'entity_value',
      v_entity->>'normalized_value',
      coalesce((v_entity->>'confidence')::double precision, 0.0),
      true,
      nullif(v_entity->>'linked_object_id', '')::uuid
    );
  end loop;

  -- 8. Replace tasks (confirmed = true) ------------------------------------
  delete from public.tasks
    where document_id = p_document_id;

  for v_task in select * from jsonb_array_elements(p_tasks)
  loop
    insert into public.tasks (
      family_id, document_id, title, due_date, priority,
      status, confidence, confirmed
    )
    values (
      p_family_id,
      p_document_id,
      v_task->>'title',
      nullif(v_task->>'due_date', '')::date,
      coalesce(v_task->>'priority', 'medium'),
      'open',
      coalesce((v_task->>'confidence')::double precision, 0.0),
      true
    );
  end loop;

  -- 9. Replace document_facts (confirmed = true) ---------------------------
  delete from public.document_facts
    where document_id = p_document_id;

  for v_fact in select * from jsonb_array_elements(p_facts)
  loop
    insert into public.document_facts (
      document_id, family_id, fact_type, label, value,
      normalized_value, confidence, confirmed
    )
    values (
      p_document_id,
      p_family_id,
      coalesce(v_fact->>'fact_type', 'other'),
      coalesce(v_fact->>'label', ''),
      coalesce(v_fact->>'value', ''),
      coalesce(v_fact->>'normalized_value', ''),
      coalesce((v_fact->>'confidence')::double precision, 0.0),
      true
    );
  end loop;

  return jsonb_build_object('status', 'confirmed', 'document_id', p_document_id);
end;
$$;

revoke execute on function public.confirm_document(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, int) from public;
grant execute on function public.confirm_document(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, int) to authenticated;
