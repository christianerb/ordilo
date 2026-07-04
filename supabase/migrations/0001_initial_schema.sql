-- Ordilo initial schema migration
-- Creates all 9 tables, pgvector extension, RLS policies, and Storage bucket.
-- See architecture.md section 3 for the authoritative data model.

-- ============================================================================
-- Extensions
-- ============================================================================

-- pgvector for semantic similarity search over document embeddings.
-- Supabase installs the extension into the `extensions` schema, which is on
-- the default search_path, so the `vector` type is usable unqualified.
create extension if not exists vector;

-- ============================================================================
-- Tables
-- ============================================================================

-- families ---------------------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users (id) on delete set null not null,
  created_at  timestamptz not null default now()
);

-- family_members ---------------------------------------------------------
create table if not exists public.family_members (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid references public.families (id) on delete cascade not null,
  name         text not null,
  role         text,                       -- e.g. "Vater", "Mutter", "Kind"
  birthdate    date,
  avatar_color text,
  created_at   timestamptz not null default now()
);

-- documents --------------------------------------------------------------
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid references public.families (id) on delete cascade not null,
  uploaded_by       uuid references auth.users (id) on delete set null not null,
  title             text,
  document_type     text,                  -- invoice | letter | contract | medical | school | insurance | tax | other
  category          text,
  status            text not null default 'uploaded',  -- uploaded | ocr_processing | ocr_done | analyzing | analyzed | confirmed | failed
  file_url          text not null,         -- Supabase Storage path
  original_filename text,
  mime_type         text,
  page_count        int,
  ocr_text          text,                  -- full concatenated OCR text
  summary           text,
  error_message     text,                  -- populated when status = 'failed'
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz
);

-- document_pages ---------------------------------------------------------
create table if not exists public.document_pages (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid references public.documents (id) on delete cascade not null,
  page_number  int not null,
  image_url    text,
  ocr_markdown text,
  layout_json  jsonb
);

-- extracted_entities -----------------------------------------------------
create table if not exists public.extracted_entities (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid references public.documents (id) on delete cascade not null,
  family_id         uuid references public.families (id) on delete cascade not null,
  entity_type       text not null,         -- person | organization | date | amount | category | tag
  entity_value      text not null,
  normalized_value  text,
  confidence        double precision not null default 0.0,
  confirmed         boolean not null default false,
  linked_object_id  uuid,                  -- links to family_member_id or knowledge_node_id
  created_at        timestamptz not null default now()
);

-- tasks ------------------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid references public.families (id) on delete cascade not null,
  document_id uuid references public.documents (id) on delete cascade not null,
  title       text not null,
  due_date    date,
  priority    text not null default 'medium',  -- low | medium | high
  status      text not null default 'open',    -- open | done | dismissed
  confidence  double precision not null default 0.0,
  confirmed   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- knowledge_nodes --------------------------------------------------------
create table if not exists public.knowledge_nodes (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid references public.families (id) on delete cascade not null,
  type            text not null,           -- person | organization | contract | insurance | health | school | vehicle | home | document | task
  label           text not null,
  properties_json jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- knowledge_edges --------------------------------------------------------
create table if not exists public.knowledge_edges (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid references public.families (id) on delete cascade not null,
  source_node_id      uuid references public.knowledge_nodes (id) on delete cascade not null,
  target_node_id      uuid references public.knowledge_nodes (id) on delete cascade not null,
  relation_type       text not null,
  confidence          double precision not null default 0.0,
  source_document_id  uuid references public.documents (id) on delete set null,
  confirmed           boolean not null default false,
  created_at          timestamptz not null default now()
);

-- document_embeddings (pgvector) -----------------------------------------
create table if not exists public.document_embeddings (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid references public.documents (id) on delete cascade not null,
  family_id     uuid references public.families (id) on delete cascade not null,
  chunk_text    text not null,
  embedding     vector(1536),
  metadata_json jsonb not null default '{}'::jsonb
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- HNSW index for fast cosine similarity search over embeddings.
create index if not exists document_embeddings_embedding_idx
  on public.document_embeddings
  using hnsw (embedding vector_cosine_ops);

-- Helpful secondary indexes for common lookups.
create index if not exists family_members_family_id_idx
  on public.family_members (family_id);
create index if not exists documents_family_id_idx
  on public.documents (family_id);
create index if not exists documents_status_idx
  on public.documents (status);
create index if not exists document_pages_document_id_idx
  on public.document_pages (document_id);
create index if not exists extracted_entities_document_id_idx
  on public.extracted_entities (document_id);
create index if not exists extracted_entities_family_id_idx
  on public.extracted_entities (family_id);
create index if not exists tasks_family_id_idx
  on public.tasks (family_id);
create index if not exists tasks_status_idx
  on public.tasks (status);
create index if not exists tasks_due_date_idx
  on public.tasks (due_date);
create index if not exists knowledge_nodes_family_id_idx
  on public.knowledge_nodes (family_id);
create index if not exists knowledge_edges_family_id_idx
  on public.knowledge_edges (family_id);
create index if not exists document_embeddings_document_id_idx
  on public.document_embeddings (document_id);
create index if not exists document_embeddings_family_id_idx
  on public.document_embeddings (family_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Helper: check whether the current user owns the given family.
-- A user "belongs to" a family when they created it. This keeps RLS
-- family-scoped via auth.uid() for every family-scoped table.
create or replace function public.user_belongs_to_family(fam_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.families f
    where f.id = fam_id
      and f.created_by = auth.uid()
  );
$$;

-- Enable RLS on all tables.
alter table public.families              enable row level security;
alter table public.family_members        enable row level security;
alter table public.documents             enable row level security;
alter table public.document_pages        enable row level security;
alter table public.extracted_entities    enable row level security;
alter table public.tasks                 enable row level security;
alter table public.knowledge_nodes       enable row level security;
alter table public.knowledge_edges       enable row level security;
alter table public.document_embeddings   enable row level security;

-- families: owner only.
create policy "families_owner_select" on public.families
  for select using (created_by = auth.uid());
create policy "families_owner_insert" on public.families
  for insert with check (created_by = auth.uid());
create policy "families_owner_update" on public.families
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "families_owner_delete" on public.families
  for delete using (created_by = auth.uid());

-- family_members: family-scoped.
create policy "family_members_select" on public.family_members
  for select using (public.user_belongs_to_family(family_id));
create policy "family_members_insert" on public.family_members
  for insert with check (public.user_belongs_to_family(family_id));
create policy "family_members_update" on public.family_members
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "family_members_delete" on public.family_members
  for delete using (public.user_belongs_to_family(family_id));

-- documents: family-scoped.
create policy "documents_select" on public.documents
  for select using (public.user_belongs_to_family(family_id));
create policy "documents_insert" on public.documents
  for insert with check (public.user_belongs_to_family(family_id));
create policy "documents_update" on public.documents
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "documents_delete" on public.documents
  for delete using (public.user_belongs_to_family(family_id));

-- document_pages: scoped via parent document's family.
create policy "document_pages_select" on public.document_pages
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and public.user_belongs_to_family(d.family_id)
    )
  );
create policy "document_pages_insert" on public.document_pages
  for insert with check (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and public.user_belongs_to_family(d.family_id)
    )
  );
create policy "document_pages_update" on public.document_pages
  for update using (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and public.user_belongs_to_family(d.family_id)
    )
  ) with check (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and public.user_belongs_to_family(d.family_id)
    )
  );
create policy "document_pages_delete" on public.document_pages
  for delete using (
    exists (
      select 1 from public.documents d
      where d.id = document_id
        and public.user_belongs_to_family(d.family_id)
    )
  );

-- extracted_entities: family-scoped.
create policy "extracted_entities_select" on public.extracted_entities
  for select using (public.user_belongs_to_family(family_id));
create policy "extracted_entities_insert" on public.extracted_entities
  for insert with check (public.user_belongs_to_family(family_id));
create policy "extracted_entities_update" on public.extracted_entities
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "extracted_entities_delete" on public.extracted_entities
  for delete using (public.user_belongs_to_family(family_id));

-- tasks: family-scoped.
create policy "tasks_select" on public.tasks
  for select using (public.user_belongs_to_family(family_id));
create policy "tasks_insert" on public.tasks
  for insert with check (public.user_belongs_to_family(family_id));
create policy "tasks_update" on public.tasks
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "tasks_delete" on public.tasks
  for delete using (public.user_belongs_to_family(family_id));

-- knowledge_nodes: family-scoped.
create policy "knowledge_nodes_select" on public.knowledge_nodes
  for select using (public.user_belongs_to_family(family_id));
create policy "knowledge_nodes_insert" on public.knowledge_nodes
  for insert with check (public.user_belongs_to_family(family_id));
create policy "knowledge_nodes_update" on public.knowledge_nodes
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "knowledge_nodes_delete" on public.knowledge_nodes
  for delete using (public.user_belongs_to_family(family_id));

-- knowledge_edges: family-scoped.
create policy "knowledge_edges_select" on public.knowledge_edges
  for select using (public.user_belongs_to_family(family_id));
create policy "knowledge_edges_insert" on public.knowledge_edges
  for insert with check (public.user_belongs_to_family(family_id));
create policy "knowledge_edges_update" on public.knowledge_edges
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "knowledge_edges_delete" on public.knowledge_edges
  for delete using (public.user_belongs_to_family(family_id));

-- document_embeddings: family-scoped.
create policy "document_embeddings_select" on public.document_embeddings
  for select using (public.user_belongs_to_family(family_id));
create policy "document_embeddings_insert" on public.document_embeddings
  for insert with check (public.user_belongs_to_family(family_id));
create policy "document_embeddings_update" on public.document_embeddings
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
create policy "document_embeddings_delete" on public.document_embeddings
  for delete using (public.user_belongs_to_family(family_id));

-- ============================================================================
-- Storage bucket
-- ============================================================================

-- Private Storage bucket for uploaded documents.
-- Files are stored at {family_id}/{document_id}/{filename} and accessed
-- via signed URLs (RLS-protected, no public access).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  null,
  null
)
on conflict (id) do nothing;
