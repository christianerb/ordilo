-- 0023_manual_notes.sql
--
-- Allow manually created documents (notes) without a file upload.
-- Makes file_url nullable so text-only notes can exist without a
-- Storage object, and adds a `source` column to distinguish scan-based
-- documents from manual notes.

-- 1. Make file_url nullable (was NOT NULL) ---------------------------------
alter table public.documents
  alter column file_url drop not null;

-- 2. Add source column: 'scan' (default) | 'manual' ------------------------
alter table public.documents
  add column if not exists source text not null default 'scan';

-- 3. Backfill existing rows ------------------------------------------------
update public.documents
  set source = 'scan'
  where source is null;
