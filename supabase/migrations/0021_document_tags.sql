-- 0021_document_tags.sql
-- Add a tags column to documents, mirroring tasks.tags (0018), so the
-- agentic chat assistant can tag documents on the user's behalf.

alter table public.documents add column if not exists tags text[] not null default '{}';
