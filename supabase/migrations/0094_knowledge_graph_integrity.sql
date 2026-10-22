-- Knowledge graph integrity and a single-round-trip traversal.
--
-- A live audit of the graph found four defects:
--
--   1. Re-analysing a confirmed document ("Neu lesen", manual notes after
--      their first analysis) deleted the document's edges and never built
--      them again. The document stayed confirmed but fell out of graph
--      search entirely.
--   2. Deleting a document left its document node behind, and its edges
--      lost their `source_document_id` (on delete set null) instead of
--      disappearing. The title of a deleted document stayed searchable in
--      the graph, and person/organization nodes only that document used
--      lingered without a single edge.
--   3. Nodes created before the switch to text-embedding-3-large still
--      carry label vectors from the old model. They live in a different
--      vector space, so they never match a query semantically.
--   4. Graph search issued up to eight sequential PostgREST requests per
--      query (seed nodes, two edge queries per hop, node lookups per hop,
--      document nodes). `graph_traversal` returns the whole neighbourhood
--      in one call.
--
-- This migration adds:
--
--   * `replace_document_graph` — rebuilds one document's graph (document
--     node, person/organization nodes, `mentions` edges) and removes the
--     entity nodes the old graph alone used. The analyze pipeline calls it
--     after re-analysing a confirmed document.
--   * an AFTER DELETE trigger on documents that removes the document's
--     graph, so a deleted document leaves nothing behind.
--   * `graph_traversal` — seed nodes (lexical ILIKE patterns plus
--     label-embedding similarity) and every edge within the hop limit, as
--     one JSON object. SECURITY INVOKER: RLS on both tables still applies.
--   * a one-time repair of the existing data (all steps idempotent).

-- ---------------------------------------------------------------------------
-- 1. replace_document_graph
-- ---------------------------------------------------------------------------

create or replace function public.replace_document_graph(
  p_document_id      uuid,
  p_family_id        uuid,
  p_title            text,
  p_persons          jsonb default '[]'::jsonb,
  p_organizations    jsonb default '[]'::jsonb,
  p_label_embeddings jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_document_node_id uuid;
  v_node_id          uuid;
  v_item             jsonb;
  v_label            text;
  v_old_targets      uuid[];
begin
  -- Entity nodes the old graph pointed at; the ones nothing else uses are
  -- removed once the new graph is in place.
  select coalesce(array_agg(distinct e.target_node_id), '{}')
    into v_old_targets
    from public.knowledge_edges e
    where e.source_document_id = p_document_id
      and e.family_id = p_family_id;

  delete from public.knowledge_edges
    where source_document_id = p_document_id
      and family_id = p_family_id;

  delete from public.knowledge_nodes
    where family_id = p_family_id
      and type = 'document'
      and properties_json->>'document_id' = p_document_id::text;

  v_label := coalesce(nullif(btrim(p_title), ''), 'Dokument');

  insert into public.knowledge_nodes (
    family_id, type, label, properties_json, label_embedding
  )
  values (
    p_family_id,
    'document',
    v_label,
    jsonb_build_object('document_id', p_document_id),
    (
      select (le->>'embedding')::vector
      from jsonb_array_elements(coalesce(p_label_embeddings, '[]'::jsonb)) le
      where le->>'label' = v_label
      limit 1
    )
  )
  returning id into v_document_node_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_persons, '[]'::jsonb))
  loop
    v_label := nullif(btrim(v_item->>'name'), '');
    continue when v_label is null;

    insert into public.knowledge_nodes (
      family_id, type, label, properties_json, label_embedding
    )
    values (
      p_family_id,
      'person',
      v_label,
      case
        when (v_item->>'person_id') is not null
          then jsonb_build_object('person_id', v_item->>'person_id')
        else '{}'::jsonb
      end,
      (
        select (le->>'embedding')::vector
        from jsonb_array_elements(coalesce(p_label_embeddings, '[]'::jsonb)) le
        where le->>'label' = v_label
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
    returning id into v_node_id;

    insert into public.knowledge_edges (
      family_id, source_node_id, target_node_id, relation_type,
      confidence, source_document_id, confirmed
    )
    values (
      p_family_id, v_document_node_id, v_node_id, 'mentions',
      coalesce((v_item->>'confidence')::double precision, 0.0),
      p_document_id, true
    )
    on conflict do nothing;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_organizations, '[]'::jsonb))
  loop
    v_label := nullif(btrim(v_item->>'name'), '');
    continue when v_label is null;

    insert into public.knowledge_nodes (
      family_id, type, label, properties_json, label_embedding
    )
    values (
      p_family_id,
      'organization',
      v_label,
      case
        when (v_item->>'type') is not null
          then jsonb_build_object('organization_type', v_item->>'type')
        else '{}'::jsonb
      end,
      (
        select (le->>'embedding')::vector
        from jsonb_array_elements(coalesce(p_label_embeddings, '[]'::jsonb)) le
        where le->>'label' = v_label
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
    returning id into v_node_id;

    insert into public.knowledge_edges (
      family_id, source_node_id, target_node_id, relation_type,
      confidence, source_document_id, confirmed
    )
    values (
      p_family_id, v_document_node_id, v_node_id, 'mentions',
      coalesce((v_item->>'confidence')::double precision, 0.0),
      p_document_id, true
    )
    on conflict do nothing;
  end loop;

  delete from public.knowledge_nodes n
    where n.id = any(v_old_targets)
      and n.type in ('person', 'organization')
      and not exists (
        select 1 from public.knowledge_edges e
        where e.source_node_id = n.id or e.target_node_id = n.id
      );

  return v_document_node_id;
end;
$$;

revoke execute on function public.replace_document_graph(
  uuid, uuid, text, jsonb, jsonb, jsonb
) from public;

grant execute on function public.replace_document_graph(
  uuid, uuid, text, jsonb, jsonb, jsonb
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Remove a deleted document's graph
-- ---------------------------------------------------------------------------
--
-- AFTER DELETE: the edges' `source_document_id` is already null by then
-- (on delete set null), but every edge of a document starts at its
-- document node, which still carries the id in `properties_json`.
-- SECURITY DEFINER because a family deletion cascades through here as
-- well; the function only ever touches rows of the deleted document.

create or replace function public.cleanup_deleted_document_graph()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_nodes uuid[];
  v_targets   uuid[];
begin
  select coalesce(array_agg(id), '{}')
    into v_doc_nodes
    from public.knowledge_nodes
    where family_id = old.family_id
      and type = 'document'
      and properties_json->>'document_id' = old.id::text;

  if cardinality(v_doc_nodes) = 0 then
    return null;
  end if;

  select coalesce(array_agg(distinct target_node_id), '{}')
    into v_targets
    from public.knowledge_edges
    where source_node_id = any(v_doc_nodes);

  -- Edges cascade with their source node.
  delete from public.knowledge_nodes where id = any(v_doc_nodes);

  delete from public.knowledge_nodes n
    where n.id = any(v_targets)
      and n.type in ('person', 'organization')
      and not exists (
        select 1 from public.knowledge_edges e
        where e.source_node_id = n.id or e.target_node_id = n.id
      );

  return null;
end;
$$;

revoke execute on function public.cleanup_deleted_document_graph() from public;

drop trigger if exists documents_cleanup_graph on public.documents;

create trigger documents_cleanup_graph
  after delete on public.documents
  for each row
  execute function public.cleanup_deleted_document_graph();

-- ---------------------------------------------------------------------------
-- 3. graph_traversal
-- ---------------------------------------------------------------------------
--
-- Seeds: nodes whose label matches any ILIKE pattern, plus the
-- `p_semantic_limit` nearest label embeddings at or above
-- `p_semantic_threshold`. Returned: the seeds (with their similarity, null
-- for a purely lexical match), every edge that touches a node reachable
-- within `p_max_hops - 1` hops of a seed, and the nodes at both ends of
-- those edges. Scoring stays in application code.

create or replace function public.graph_traversal(
  p_family_id          uuid,
  p_patterns           text[],
  p_query_embedding    vector(1536) default null,
  p_semantic_threshold float default 0.48,
  p_semantic_limit     int default 8,
  p_max_hops           int default 2
)
returns jsonb
language sql
stable
security invoker
as $$
  with recursive
  lexical as (
    select n.id, null::float as similarity
    from public.knowledge_nodes n
    where n.family_id = p_family_id
      and coalesce(cardinality(p_patterns), 0) > 0
      and n.label ilike any(p_patterns)
  ),
  semantic as (
    select s.id, s.similarity
    from (
      select n.id, 1 - (n.label_embedding <=> p_query_embedding) as similarity
      from public.knowledge_nodes n
      where p_query_embedding is not null
        and n.family_id = p_family_id
        and n.label_embedding is not null
      order by n.label_embedding <=> p_query_embedding
      limit greatest(p_semantic_limit, 0)
    ) s
    where s.similarity >= p_semantic_threshold
  ),
  seeds as (
    select id, max(similarity) as similarity
    from (select * from lexical union all select * from semantic) both_kinds
    group by id
  ),
  reach (node_id, depth) as (
    select id, 0 from seeds
    union
    select
      case when e.source_node_id = r.node_id then e.target_node_id else e.source_node_id end,
      r.depth + 1
    from reach r
    join public.knowledge_edges e
      on e.family_id = p_family_id
     and (e.source_node_id = r.node_id or e.target_node_id = r.node_id)
    where r.depth + 1 < p_max_hops
  ),
  frontier as (
    select distinct node_id from reach
  ),
  hop_edges as (
    select distinct e.id, e.source_node_id, e.target_node_id,
           e.source_document_id, e.confidence, e.confirmed
    from public.knowledge_edges e
    join frontier f
      on e.source_node_id = f.node_id or e.target_node_id = f.node_id
    where e.family_id = p_family_id
    limit 5000
  ),
  hop_nodes as (
    select n.id, n.type, n.label, n.properties_json->>'document_id' as document_id
    from public.knowledge_nodes n
    where n.family_id = p_family_id
      and n.id in (
        select source_node_id from hop_edges
        union select target_node_id from hop_edges
        union select id from seeds
      )
  )
  select jsonb_build_object(
    'seeds', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'similarity', similarity)) from seeds), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(to_jsonb(h)) from hop_edges h), '[]'::jsonb),
    'nodes', coalesce((select jsonb_agg(to_jsonb(n)) from hop_nodes n), '[]'::jsonb)
  );
$$;

revoke execute on function public.graph_traversal(
  uuid, text[], vector, float, int, int
) from public;

grant execute on function public.graph_traversal(
  uuid, text[], vector, float, int, int
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. One-time repair of existing data (idempotent)
-- ---------------------------------------------------------------------------

-- 4a. Edges of documents that no longer exist.
delete from public.knowledge_edges
  where source_document_id is null;

-- 4b. Document nodes of documents that no longer exist.
delete from public.knowledge_nodes n
  where n.type = 'document'
    and not exists (
      select 1 from public.documents d
      where d.id::text = n.properties_json->>'document_id'
    );

-- 4c. Rebuild the graph of confirmed documents that lost their edges in a
--     re-analysis, from their confirmed person/organization entities, and
--     give every confirmed document without a document node one (notes
--     never had one), so its title is reachable in the graph.
--     Label vectors are filled in later by the label-embedding backfill.
do $$
declare
  v_doc record;
begin
  for v_doc in
    select d.id, d.family_id, d.title
    from public.documents d
    where d.status = 'confirmed'
      and not exists (
        select 1 from public.knowledge_edges e
        where e.source_document_id = d.id
      )
      and (
        exists (
          select 1 from public.extracted_entities x
          where x.document_id = d.id
            and x.entity_type in ('person', 'organization')
            and x.confirmed
        )
        or not exists (
          select 1 from public.knowledge_nodes n
          where n.family_id = d.family_id
            and n.type = 'document'
            and n.properties_json->>'document_id' = d.id::text
        )
      )
  loop
    perform public.replace_document_graph(
      v_doc.id,
      v_doc.family_id,
      v_doc.title,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', x.entity_value,
          'person_id', x.linked_object_id,
          'confidence', x.confidence
        ))
        from public.extracted_entities x
        where x.document_id = v_doc.id
          and x.entity_type = 'person'
          and x.confirmed
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', x.entity_value,
          'confidence', x.confidence
        ))
        from public.extracted_entities x
        where x.document_id = v_doc.id
          and x.entity_type = 'organization'
          and x.confirmed
      ), '[]'::jsonb),
      '[]'::jsonb
    );
  end loop;
end;
$$;

-- 4d. Person/organization nodes no edge uses any more.
delete from public.knowledge_nodes n
  where n.type in ('person', 'organization')
    and not exists (
      select 1 from public.knowledge_edges e
      where e.source_node_id = n.id or e.target_node_id = n.id
    );

-- 4e. Label vectors from before the switch to text-embedding-3-large
--     (first large-model node: 2026-07-20 ~06:04 UTC). A cleared vector is
--     re-embedded by the backfill; clearing a vector that was already
--     current only costs one extra embedding call.
update public.knowledge_nodes
  set label_embedding = null
  where label_embedding is not null
    and created_at < timestamptz '2026-07-20 07:00:00+00';
