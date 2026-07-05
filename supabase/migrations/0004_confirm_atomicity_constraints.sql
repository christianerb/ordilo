-- ============================================================================
-- Confirm atomicity & idempotency constraints
-- ============================================================================
--
-- Adds uniqueness constraints so that concurrent or repeated confirm
-- operations cannot leave duplicate state in knowledge_nodes,
-- knowledge_edges, and document_embeddings.
--
-- These constraints are a defence-in-depth layer on top of the
-- conditional atomic transition (UPDATE ... WHERE status = 'analyzed')
-- and the clear-before-insert pattern used by the confirm route.
-- They absorb concurrent duplicate inserts that could slip through if
-- two requests race past the conditional transition (e.g. a retry
-- after a transient error).
--
-- See VAL-CONFIRM-011 (failure rolls back / marks failed) and
-- VAL-CONFIRM-012 (idempotent on retry).

-- ---------------------------------------------------------------------------
-- knowledge_nodes: unique per (family, type, label) for person/organization
-- ---------------------------------------------------------------------------
--
-- Person and organization nodes are shared across documents within a
-- family. The confirm route uses a find-or-create pattern; this unique
-- index ensures that concurrent confirm calls cannot create duplicate
-- person/organization nodes for the same family.
--
-- Document nodes (type = 'document') are intentionally excluded because
-- different documents may share the same title (label). Document nodes
-- are unique per document_id (stored in properties_json) and are
-- cleared + re-created on each confirm.

create unique index if not exists knowledge_nodes_person_org_unique_idx
  on public.knowledge_nodes (family_id, type, label)
  where type in ('person', 'organization');

-- ---------------------------------------------------------------------------
-- knowledge_edges: unique per (document, target, relation)
-- ---------------------------------------------------------------------------
--
-- Prevents duplicate edges linking the same document to the same target
-- node with the same relation type. On retry, the confirm route clears
-- prior edges before inserting new ones; this constraint absorbs any
-- concurrent duplicate that slips through.

create unique index if not exists knowledge_edges_doc_target_relation_unique_idx
  on public.knowledge_edges (source_document_id, target_node_id, relation_type)
  where source_document_id is not null;

-- ---------------------------------------------------------------------------
-- document_embeddings: unique per (document, chunk_text)
-- ---------------------------------------------------------------------------
--
-- Prevents duplicate embedding rows for the same document. On retry,
-- the confirm route deletes prior embeddings before inserting new ones
-- (replace, not append); this constraint absorbs any concurrent
-- duplicate that slips through.

create unique index if not exists document_embeddings_doc_chunk_unique_idx
  on public.document_embeddings (document_id, chunk_text);
