-- ============================================================================
-- Family uniqueness constraint (one family per user)
-- ============================================================================
--
-- Adds a unique index on families.created_by so that concurrent retries of
-- the onboarding family-creation step cannot create duplicate family rows.
-- The createFamily server action also handles the constraint-violation path
-- gracefully (re-reads and returns the existing family on error code 23505).
--
-- Before adding the constraint, any existing duplicate families are
-- consolidated: for each user with multiple families, the oldest family
-- (by created_at) is kept as canonical, and all family-scoped data from
-- younger duplicates is re-parented to the canonical family. Rows that
-- would conflict with existing uniqueness constraints after re-parenting
-- are removed first. Then the empty duplicates are deleted.

-- ---------------------------------------------------------------------------
-- Step 1: Identify canonical (oldest) and duplicate families per user.
-- ---------------------------------------------------------------------------

create temp table _fam_canonical as
select id as canonical_id, created_by
from (
  select id, created_by,
    row_number() over (partition by created_by order by created_at) as rn
  from public.families
  where created_by is not null
) ranked
where rn = 1;

create temp table _fam_dupes as
select f.id as dup_id, c.canonical_id
from public.families f
join _fam_canonical c on f.created_by = c.created_by
where f.id <> c.canonical_id;

-- ---------------------------------------------------------------------------
-- Step 2: Re-parent family-scoped data from duplicates to canonical.
-- ---------------------------------------------------------------------------

-- Tables without family_id-scoped uniqueness constraints: safe to re-parent
-- directly. (document_pages is scoped via document_id, so re-parenting
-- documents is sufficient — pages follow their parent document.)

update public.family_members
  set family_id = c.canonical_id
  from _fam_dupes c
  where family_members.family_id = c.dup_id;

update public.documents
  set family_id = c.canonical_id
  from _fam_dupes c
  where documents.family_id = c.dup_id;

update public.extracted_entities
  set family_id = c.canonical_id
  from _fam_dupes c
  where extracted_entities.family_id = c.dup_id;

update public.tasks
  set family_id = c.canonical_id
  from _fam_dupes c
  where tasks.family_id = c.dup_id;

-- knowledge_nodes: remove conflicting person/organization nodes from
-- duplicates (the unique index on (family_id, type, label) for
-- person/organization types could conflict after re-parenting), then
-- re-parent the rest.
delete from public.knowledge_nodes kn
  using _fam_dupes c, public.knowledge_nodes canon
  where kn.family_id = c.dup_id
    and canon.family_id = c.canonical_id
    and canon.type = kn.type
    and canon.label = kn.label
    and kn.type in ('person', 'organization');

update public.knowledge_nodes
  set family_id = c.canonical_id
  from _fam_dupes c
  where knowledge_nodes.family_id = c.dup_id;

-- knowledge_edges: remove conflicting edges from duplicates (the unique
-- index on (source_document_id, target_node_id, relation_type) where
-- source_document_id is not null could conflict after re-parenting).
-- Edges referencing deleted knowledge_nodes are automatically cascade-deleted
-- via the ON DELETE CASCADE foreign key on target_node_id.
delete from public.knowledge_edges ke
  using _fam_dupes c, public.knowledge_edges canon
  where ke.family_id = c.dup_id
    and canon.family_id = c.canonical_id
    and canon.source_document_id = ke.source_document_id
    and canon.target_node_id = ke.target_node_id
    and canon.relation_type = ke.relation_type
    and ke.source_document_id is not null;

update public.knowledge_edges
  set family_id = c.canonical_id
  from _fam_dupes c
  where knowledge_edges.family_id = c.dup_id;

-- document_embeddings: remove conflicting embeddings from duplicates (the
-- unique index on (document_id, chunk_text) could conflict after
-- re-parenting), then re-parent the rest.
delete from public.document_embeddings de
  using _fam_dupes c, public.document_embeddings canon
  where de.family_id = c.dup_id
    and canon.family_id = c.canonical_id
    and de.document_id = canon.document_id
    and de.chunk_text = canon.chunk_text;

update public.document_embeddings
  set family_id = c.canonical_id
  from _fam_dupes c
  where document_embeddings.family_id = c.dup_id;

-- ---------------------------------------------------------------------------
-- Step 3: Delete the now-empty duplicate families.
-- ---------------------------------------------------------------------------

delete from public.families f
  using _fam_dupes c
  where f.id = c.dup_id;

-- ---------------------------------------------------------------------------
-- Step 4: Add the unique index on families.created_by.
-- ---------------------------------------------------------------------------

-- Partial index (WHERE created_by IS NOT NULL) for safety, even though the
-- column is declared NOT NULL. This ensures the constraint can always be
-- created even if any rows have a NULL created_by (e.g. due to the
-- ON DELETE SET NULL foreign key behavior if a user is deleted from
-- auth.users and the NOT NULL constraint is somehow bypassed).

create unique index if not exists families_created_by_unique_idx
  on public.families (created_by)
  where created_by is not null;

-- Clean up temp tables.
drop table _fam_dupes;
drop table _fam_canonical;
