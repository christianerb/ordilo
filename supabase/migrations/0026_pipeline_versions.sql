-- 0026_pipeline_versions.sql
--
-- Pipeline versioning: stamp every embedding row and every analyzed
-- document with the pipeline version that produced it.
--
-- Why: the embedding model, chunking strategy, and extraction prompt WILL
-- change. Without a version stamp there is no way to know which documents
-- were processed with an outdated pipeline, and no way to re-index the
-- backlog selectively. With it, a `reindex` job (see 0025) can target
-- exactly the rows where `pipeline_version < current`.
--
-- The current version constant lives in `src/lib/ai/models.ts`
-- (PIPELINE_VERSION). Version 1 = everything created before versioning.

alter table public.document_embeddings
  add column if not exists pipeline_version int not null default 1;

alter table public.documents
  add column if not exists extraction_version int;

-- Backfill: existing analyzed/confirmed documents were produced by v1.
update public.documents
  set extraction_version = 1
  where extraction_version is null
    and status in ('analyzed', 'confirmed');

-- Find stale embeddings per family quickly (reindex candidate scan).
create index if not exists document_embeddings_family_version_idx
  on public.document_embeddings (family_id, pipeline_version);

-- ============================================================================
-- Transactional embedding replacement (used by the reindex job)
-- ============================================================================
--
-- Replaces all embedding rows of a document atomically so a mid-reindex
-- failure can never leave a document without embeddings. The worker calls
-- this with precomputed vectors (OpenAI is called outside the transaction).
--
-- p_embeddings format (same shape the confirm RPC uses):
--   [{"chunk_text": "...", "embedding": "[0.1,...]", "page_number": 1,
--     "chunk_index": 0, "chunk_total": 4, "chunk_type": "chunk"}, ...]

create or replace function public.replace_document_embeddings(
  p_document_id      uuid,
  p_family_id        uuid,
  p_embeddings       jsonb default '[]'::jsonb,
  p_pipeline_version int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emb   jsonb;
  v_count int := 0;
begin
  delete from public.document_embeddings
    where document_id = p_document_id;

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
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'status', 'replaced',
    'document_id', p_document_id,
    'embedding_count', v_count
  );
end;
$$;

-- Only the service-role worker re-indexes.
revoke all on function public.replace_document_embeddings(uuid, uuid, jsonb, int) from public;
revoke all on function public.replace_document_embeddings(uuid, uuid, jsonb, int) from anon, authenticated;
grant execute on function public.replace_document_embeddings(uuid, uuid, jsonb, int) to service_role;
