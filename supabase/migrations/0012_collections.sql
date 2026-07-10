-- ============================================================================
-- Collections ("Sammlungen")
-- ============================================================================
--
-- User-defined, persistent document folders shown in the sidebar. A
-- collection is backed by the existing free-text `documents.category`
-- field: a collection's documents are all rows where
-- `lower(documents.category) = lower(collections.name)`. This lets a
-- collection exist (and appear in the sidebar) with zero documents, while
-- reusing the categorization the AI analysis pipeline already produces.
--
-- Renaming a collection cascades the rename onto any matching documents'
-- `category` value (handled in application code, not here) so the link is
-- preserved. Deleting a collection only removes the sidebar folder — the
-- underlying documents keep their `category` value untouched.

create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid references public.families (id) on delete cascade not null,
  name        text not null,
  icon        text not null default 'file-text',
  color       text not null default 'petrol',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- One collection per name per family (case-insensitive) — prevents
-- duplicate folders like "Schule" and "schule".
create unique index if not exists collections_family_id_lower_name_idx
  on public.collections (family_id, lower(name));

create index if not exists collections_family_id_idx
  on public.collections (family_id);

alter table public.collections enable row level security;

create policy "collections_select" on public.collections
  for select using (public.user_belongs_to_family(family_id));
create policy "collections_insert" on public.collections
  for insert with check (public.user_belongs_to_family(family_id));
create policy "collections_update" on public.collections
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "collections_delete" on public.collections
  for delete using (public.user_belongs_to_family(family_id));
