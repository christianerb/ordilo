-- Notes as first-class documents + encrypted secret storage.
--
-- Two changes in one migration:
--
-- 1. Encrypted secrets on documents.
--    Add `documents.secret` (text, nullable). It holds an AES-256-GCM
--    envelope (ciphertext only) for a single hidden value such as a
--    password. The plaintext is NEVER stored — not in `secret`, not in
--    `ocr_text`, not anywhere. The encryption key lives in the server
--    environment (SECRETS_ENCRYPTION_KEY), never in the database, so a
--    DB dump reveals only ciphertext. Only the reveal API returns the
--    decrypted value on demand.
--
-- 2. Inventory becomes notes.
--    The separate `family_inventory_items` table is folded into
--    `documents`: every existing inventory item becomes a confirmed
--    document of the new type 'note' (source = 'manual'), with its
--    name/context as `ocr_text` so it is searchable like any document.
--    A `reindex` processing job is enqueued per migrated document so the
--    worker backfills semantic + lexical embeddings (the documents
--    become searchable without forcing the user through the review
--    queue). The now-obsolete `family_inventory_items` table and its
--    `inventory_item` entity links are removed.
--
-- Idempotent: `add column if not exists`, `drop table if exists`,
-- `drop policy if exists`, and the data move is guarded so re-running
-- does not duplicate migrated documents.

-- ---------------------------------------------------------------------------
-- 1. Encrypted secret column
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists secret text;

comment on column public.documents.secret is
  'AES-256-GCM envelope (ciphertext only) for a hidden value such as a '
  'password. Plaintext is never stored; the key lives in the server env.';

-- ---------------------------------------------------------------------------
-- 2. Inventory -> note documents
-- ---------------------------------------------------------------------------

-- Move each inventory item into a confirmed note document. The source table
-- is deliberately checked at runtime: migrations may be replayed after it
-- has been dropped. The note keeps all useful context, rather than reducing
-- an item such as "Emmas Krankenversicherung" to only its name and tags.
do $$
begin
  if to_regclass('public.family_inventory_items') is not null then
    insert into public.documents (
      id,
      family_id,
      uploaded_by,
      status,
      confirmed_at,
      source,
      document_type,
      title,
      ocr_text,
      page_count,
      created_at
    )
    select
      gen_random_uuid(),
      i.family_id,
      f.created_by,
      'confirmed',
      now(),
      'manual',
      'note',
      i.name,
      i.name ||
      E'\nArt: ' || i.item_type ||
      case when m.name is not null
        then E'\nGehört zu: ' || m.name
        else ''
      end ||
      case when i.metadata <> '{}'::jsonb
        then E'\nDetails: ' || jsonb_pretty(i.metadata)
        else ''
      end ||
      case when coalesce(array_to_string(i.tags, ', '), '') <> ''
        then E'\nStichwörter: ' || array_to_string(i.tags, ', ')
        else ''
      end,
      1,
      coalesce(i.created_at, now())
    from public.family_inventory_items i
    join public.families f on f.id = i.family_id
    left join public.family_members m on m.id = i.linked_member_id
    where i.status = 'confirmed'
      and not exists (
        select 1
        from public.documents d
        where d.family_id = i.family_id
          and d.title = i.name
          and d.document_type = 'note'
          and d.source = 'manual'
      );
  end if;
end $$;

-- A page row per migrated note so re-analysis / reindex can read the text
-- the same way as a manually authored note.
insert into public.document_pages (document_id, page_number, ocr_markdown)
select d.id, 1, d.ocr_text
from public.documents d
where d.document_type = 'note'
  and d.source = 'manual'
  and not exists (
    select 1 from public.document_pages p where p.document_id = d.id
  );

-- Backfill embeddings asynchronously: one reindex job per migrated note.
-- The worker only re-embeds confirmed documents, which these are.
insert into public.processing_jobs (family_id, document_id, job_type, payload)
select d.family_id, d.id, 'reindex', '{}'::jsonb
from public.documents d
where d.document_type = 'note'
  and d.source = 'manual'
  and not exists (
    select 1
    from public.document_embeddings e
    where e.document_id = d.id
  )
on conflict do nothing;

-- Obsolete inventory_item entity links (no FK, just clean dangling rows).
delete from public.extracted_entities
  where entity_type = 'inventory_item';

-- Drop the inventory table and its policies only while the source relation
-- exists. `drop policy if exists ... on missing_table` still errors in
-- PostgreSQL, so this must be guarded separately from `drop table if exists`.
do $$
begin
  if to_regclass('public.family_inventory_items') is not null then
    execute 'drop policy if exists "inventory_items_select" on public.family_inventory_items';
    execute 'drop policy if exists "inventory_items_insert" on public.family_inventory_items';
    execute 'drop policy if exists "inventory_items_update" on public.family_inventory_items';
    execute 'drop policy if exists "inventory_items_delete" on public.family_inventory_items';
    execute 'drop table public.family_inventory_items';
  end if;
end $$;
