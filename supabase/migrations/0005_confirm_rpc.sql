-- ============================================================================
-- Confirm document RPC (single-transaction atomic confirm)
-- ============================================================================
--
-- Moves the entire confirm mutation set into a single Postgres transaction,
-- implemented as a PL/pgSQL function invoked via supabase.rpc(...).
--
-- All writes commit or roll back together, so a mid-route failure cannot
-- leave partial graph/embedding/entity/task state (VAL-CONFIRM-011).
-- Shared knowledge_nodes (person/organization) are created via
-- ON CONFLICT DO UPDATE so concurrent confirms converge on the same node
-- instead of one request failing on the unique constraint (VAL-CONFIRM-012).
--
-- The route generates OpenAI embeddings FIRST (outside the DB transaction),
-- then calls this RPC with the precomputed vectors. The RPC:
--   1. Conditional transition analyzed -> confirmed (aborts if not 'analyzed')
--   2. Clears prior knowledge_edges / document_embeddings / document node
--   3. UPSERTs person/organization nodes (ON CONFLICT DO UPDATE)
--   4. Creates the document node + knowledge_edges
--   5. Inserts the precomputed document_embeddings (page_number provenance)
--   6. Replaces extracted_entities (confirmed = true)
--   7. Replaces tasks (confirmed = true)
--
-- Security: SECURITY INVOKER (the default) so RLS still enforces family
-- ownership. The route performs the 403/404 ownership check before calling
-- the RPC; RLS inside the function is defence-in-depth.
--
-- Returns:
--   {"status": "confirmed", "document_id": "..."} on success
--   {"status": "status_changed"} when the row is not in 'analyzed' (double-
--     submit / concurrent transition). No mutations are performed in this
--     case, so the route returns 409 STATUS_CHANGED without marking failed.
--   On any other error the function raises, the transaction rolls back, and
--   the route marks the document failed.

create or replace function public.confirm_document(
  p_document_id   uuid,
  p_family_id     uuid,
  p_title         text,
  p_summary       text,
  p_document_type text,
  p_category      text,
  p_persons       jsonb default '[]'::jsonb,
  p_organizations jsonb default '[]'::jsonb,
  p_embeddings    jsonb default '[]'::jsonb,
  p_entities      jsonb default '[]'::jsonb,
  p_tasks         jsonb default '[]'::jsonb
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
  v_transitioned     int;
begin
  -- 1. Conditional atomic transition: analyzed -> confirmed ----------------
  -- Only a document in 'analyzed' state can be transitioned. If a concurrent
  -- request changed the status between the route's read and this call, the
  -- update matches 0 rows. We return 'status_changed' (not an exception) so
  -- the route can respond 409 without marking the document failed.
  update public.documents
    set status        = 'confirmed',
        confirmed_at  = now(),
        title         = p_title,
        summary       = p_summary,
        document_type = p_document_type,
        category      = p_category,
        error_message = null
    where id = p_document_id
      and status = 'analyzed';

  get diagnostics v_transitioned = row_count;

  if v_transitioned = 0 then
    -- The document is not in 'analyzed' (double-submit, concurrent confirm,
    -- or already transitioned). Return early without any mutations so the
    -- route can return 409 STATUS_CHANGED.
    return jsonb_build_object('status', 'status_changed');
  end if;

  -- 2. Clear prior graph/embedding state (idempotency) ---------------------
  -- On retry (e.g. after re-analyze), prior edges/embeddings/document node
  -- are removed before inserting new ones so no duplicates remain.
  -- Person/organization nodes are NOT deleted here — they may be shared
  -- across documents and are upserted in steps 4-5.
  delete from public.knowledge_edges
    where source_document_id = p_document_id;

  delete from public.document_embeddings
    where document_id = p_document_id;

  delete from public.knowledge_nodes
    where type = 'document'
      and properties_json->>'document_id' = p_document_id::text;

  -- 3. Create the document node --------------------------------------------
  insert into public.knowledge_nodes (family_id, type, label, properties_json)
  values (
    p_family_id,
    'document',
    coalesce(nullif(p_title, ''), 'Dokument'),
    jsonb_build_object('document_id', p_document_id)
  )
  returning id into v_document_node_id;

  -- 4. UPSERT person nodes + create edges ----------------------------------
  -- ON CONFLICT DO UPDATE converges concurrent confirms on the same node
  -- (VAL-CONFIRM-012). The self-update on `label` is a no-op that lets us
  -- RETURN the existing node's id (ON CONFLICT DO NOTHING would not return
  -- the conflicting row). Existing properties_json is preserved.
  for v_person in select * from jsonb_array_elements(p_persons)
  loop
    insert into public.knowledge_nodes (family_id, type, label, properties_json)
    values (
      p_family_id,
      'person',
      v_person->>'name',
      case
        when (v_person->>'person_id') is not null
          then jsonb_build_object('person_id', v_person->>'person_id')
        else '{}'::jsonb
      end
    )
    on conflict (family_id, type, label)
      where type in ('person', 'organization')
    do update set label = excluded.label
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
    insert into public.knowledge_nodes (family_id, type, label, properties_json)
    values (
      p_family_id,
      'organization',
      v_org->>'name',
      jsonb_build_object('organization_type', v_org->>'type')
    )
    on conflict (family_id, type, label)
      where type in ('person', 'organization')
    do update set label = excluded.label
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

  -- 6. Insert precomputed embeddings (with page_number provenance) ---------
  -- Embeddings are generated by the route via OpenAI BEFORE this RPC, then
  -- passed in. Each row carries page_number in metadata_json for page-aware
  -- search results (VAL-CONFIRM-005).
  for v_emb in select * from jsonb_array_elements(p_embeddings)
  loop
    insert into public.document_embeddings (
      document_id, family_id, chunk_text, embedding, metadata_json
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
        'chunk_total',  coalesce((v_emb->>'chunk_total')::int, 0)
      )
    );
  end loop;

  -- 7. Replace extracted_entities (confirmed = true) -----------------------
  -- The route builds the entity rows from the (possibly edited) payload and
  -- passes them in. We delete prior rows then insert the confirmed set.
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
  -- Deleted tasks (by the user in the Review Card) are already excluded from
  -- the payload's tasks array, so they are not re-inserted.
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

  return jsonb_build_object('status', 'confirmed', 'document_id', p_document_id);
end;
$$;

-- Revoke public execute; only authenticated callers (via PostgREST with the
-- user's JWT, so RLS applies) should invoke this. Supabase exposes functions
-- to the `authenticated` and `anon` roles by default; we tighten to
-- `authenticated` since confirm requires a session.
revoke execute on function public.confirm_document(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.confirm_document(uuid, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
