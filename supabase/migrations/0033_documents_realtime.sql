-- 0033_documents_realtime.sql
--
-- Publish `documents` on the Supabase Realtime publication so clients can
-- subscribe to pipeline status changes (uploaded → ocr_processing →
-- ocr_done → analyzing → analyzed) instead of polling every 1.5s.
--
-- Scope: INSERT/UPDATE events only are consumed by the client (deletes are
-- always user-initiated and handled optimistically in the UI), so the
-- default replica identity (primary key) is sufficient — no
-- REPLICA IDENTITY FULL, no old-row broadcasting.
--
-- Security: Realtime postgres_changes enforces the table's RLS policies
-- for authenticated subscribers — a family only ever receives events for
-- its own rows (`documents` RLS is family-scoped since 0001).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
