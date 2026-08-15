-- Editing a document that is already in the family book.
--
-- Until now the only way to change an extracted value after confirming was
-- "Neu lesen" — throwing the analysis away and letting the AI guess again.
-- A family that spots a wrong name, date, or amount needs to fix exactly
-- that one value and keep everything else.
--
-- `update_confirmed_document` is the confirm RPC minus the parts an edit
-- must not touch:
--
--   * status / confirmed_at stay as they are (the document was added once;
--     editing it later is not a second "added" moment)
--   * tasks and document_facts are left alone — both have their own edit
--     surfaces (task detail sheet, "Nummern & Kennungen"), and rewriting
--     tasks here would reset their status and assignee
--
-- What it does rewrite, inside one transaction:
--   * documents: title, summary, document_type, category
--   * the knowledge graph for this document (document node + person and
--     organization nodes/edges), so search follows the corrected names
--   * document_embeddings — the OCR text is unchanged, but the vectors are
--     not built from it alone: chunks are contextualized with the title and
--     the synthetic question rows are generated from title, summary, type,
--     persons, organization and tags. Leaving them would keep answering
--     searches with the old name.
--   * extracted_entities (persons, organizations, dates, amounts, category,
--     tags) — the same replace-all semantics as confirm
--
-- Idempotent: `create or replace`, plus a defensive drop of the earlier
-- signature (this function gained `p_embeddings` before its first release,
-- and an overload would make the PostgREST call ambiguous).

drop function if exists public.update_confirmed_document(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb
);

create or replace function public.update_confirmed_document(
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
  v_label_emb        jsonb;
  v_updated          int;
begin
  create temp table if not exists tmp_label_embeddings (
    label text,
    embedding vector(1536)
  );
  truncate table tmp_label_embeddings;

  for v_label_emb in select * from jsonb_array_elements(p_label_embeddings)
  loop
    insert into tmp_label_embeddings (label, embedding)
    values (v_label_emb->>'label', (v_label_emb->>'embedding')::vector);
  end loop;

  -- Only a confirmed document can be edited here. A document still in
  -- review goes through the normal confirm flow instead.
  update public.documents
    set title         = p_title,
        summary       = p_summary,
        document_type = p_document_type,
        category      = p_category
    where id = p_document_id
      and status = 'confirmed';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('status', 'status_changed');
  end if;

  delete from public.knowledge_edges
    where source_document_id = p_document_id;

  delete from public.knowledge_nodes
    where type = 'document'
      and properties_json->>'document_id' = p_document_id::text;

  insert into public.knowledge_nodes (
    family_id,
    type,
    label,
    properties_json,
    label_embedding
  )
  values (
    p_family_id,
    'document',
    coalesce(nullif(p_title, ''), 'Dokument'),
    jsonb_build_object('document_id', p_document_id),
    (
      select embedding
      from tmp_label_embeddings
      where label = coalesce(nullif(p_title, ''), 'Dokument')
      limit 1
    )
  )
  returning id into v_document_node_id;

  for v_person in select * from jsonb_array_elements(p_persons)
  loop
    insert into public.knowledge_nodes (
      family_id,
      type,
      label,
      properties_json,
      label_embedding
    )
    values (
      p_family_id,
      'person',
      v_person->>'name',
      case
        when (v_person->>'person_id') is not null
          then jsonb_build_object('person_id', v_person->>'person_id')
        else '{}'::jsonb
      end,
      (
        select embedding
        from tmp_label_embeddings
        where label = v_person->>'name'
        limit 1
      )
    )
    on conflict (family_id, type, label)
      where type in ('person', 'organization')
    do update
      set label = excluded.label,
          label_embedding = coalesce(
            excluded.label_embedding,
            knowledge_nodes.label_embedding
          )
    returning id into v_person_node_id;

    insert into public.knowledge_edges (
      family_id,
      source_node_id,
      target_node_id,
      relation_type,
      confidence,
      source_document_id,
      confirmed
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

  for v_org in select * from jsonb_array_elements(p_organizations)
  loop
    insert into public.knowledge_nodes (
      family_id,
      type,
      label,
      properties_json,
      label_embedding
    )
    values (
      p_family_id,
      'organization',
      v_org->>'name',
      jsonb_build_object('organization_type', v_org->>'type'),
      (
        select embedding
        from tmp_label_embeddings
        where label = v_org->>'name'
        limit 1
      )
    )
    on conflict (family_id, type, label)
      where type in ('person', 'organization')
    do update
      set label = excluded.label,
          label_embedding = coalesce(
            excluded.label_embedding,
            knowledge_nodes.label_embedding
          )
    returning id into v_org_node_id;

    insert into public.knowledge_edges (
      family_id,
      source_node_id,
      target_node_id,
      relation_type,
      confidence,
      source_document_id,
      confirmed
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

  delete from public.document_embeddings
    where document_id = p_document_id;

  for v_emb in select * from jsonb_array_elements(p_embeddings)
  loop
    insert into public.document_embeddings (
      document_id,
      family_id,
      chunk_text,
      embedding,
      metadata_json,
      pipeline_version
    )
    values (
      p_document_id,
      p_family_id,
      v_emb->>'chunk_text',
      (v_emb->>'embedding')::vector,
      jsonb_build_object(
        'document_id', p_document_id,
        'page_number', coalesce((v_emb->>'page_number')::int, 1),
        'chunk_index', coalesce((v_emb->>'chunk_index')::int, 0),
        'chunk_total', coalesce((v_emb->>'chunk_total')::int, 0),
        'chunk_type', coalesce(v_emb->>'chunk_type', 'chunk')
      ),
      p_pipeline_version
    );
  end loop;

  delete from public.extracted_entities
    where document_id = p_document_id;

  for v_entity in select * from jsonb_array_elements(p_entities)
  loop
    insert into public.extracted_entities (
      document_id,
      family_id,
      entity_type,
      entity_value,
      normalized_value,
      label,
      amount_minor,
      currency,
      amount_kind,
      value_date,
      confidence,
      confirmed,
      linked_object_id
    )
    values (
      p_document_id,
      p_family_id,
      v_entity->>'entity_type',
      v_entity->>'entity_value',
      v_entity->>'normalized_value',
      nullif(v_entity->>'label', ''),
      (v_entity->>'amount_minor')::bigint,
      nullif(v_entity->>'currency', ''),
      nullif(v_entity->>'amount_kind', ''),
      (nullif(v_entity->>'value_date', ''))::date,
      coalesce((v_entity->>'confidence')::double precision, 0.0),
      true,
      nullif(v_entity->>'linked_object_id', '')::uuid
    );
  end loop;

  return jsonb_build_object(
    'status',
    'updated',
    'document_id',
    p_document_id
  );
end;
$$;

revoke execute on function public.update_confirmed_document(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, int
) from public;

grant execute on function public.update_confirmed_document(
  uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, int
) to authenticated;
