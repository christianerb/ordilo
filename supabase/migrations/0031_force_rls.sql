-- Force Row Level Security on all tables.
--
-- `enable row level security` creates policies but the table owner
-- (postgres) still bypasses them. `force row level security` ensures
-- even the table owner is subject to RLS, which is a defensive measure
-- against future admin queries that might accidentally bypass policies.
--
-- The service-role client (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS
-- regardless, so this does not affect existing API routes that use the
-- admin client. It does protect against direct SQL access via the
-- postgres role or any future non-service-role admin connection.

alter table public.families              force row level security;
alter table public.family_members        force row level security;
alter table public.documents             force row level security;
alter table public.document_pages        force row level security;
alter table public.extracted_entities    force row level security;
alter table public.tasks                 force row level security;
alter table public.knowledge_nodes       force row level security;
alter table public.knowledge_edges       force row level security;
alter table public.document_embeddings   force row level security;
alter table public.collections           force row level security;
alter table public.chat_conversations    force row level security;
alter table public.chat_messages         force row level security;
alter table public.chat_usage            force row level security;
alter table public.family_inventory_items force row level security;
alter table public.task_documents        force row level security;
alter table public.family_memberships    force row level security;
alter table public.processing_jobs       force row level security;
alter table public.document_facts        force row level security;
alter table public.family_invites        force row level security;
alter table public.chat_feedback_events  force row level security;
