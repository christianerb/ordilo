-- Let an owner of a one-person family safely join an invited family.
--
-- Ordilo has one active family per account. Instead of silently selecting an
-- arbitrary family (or discarding data), this migration previews and performs
-- a complete move from the owner's private family into the invited family.
-- The source family must have no other account members: moving shared data
-- without every member's consent would be unsafe.

create table if not exists public.family_merge_operations (
  id uuid primary key default gen_random_uuid(),
  source_family_id uuid not null,
  target_family_id uuid not null,
  performed_by uuid references auth.users (id) on delete set null,
  preview_fingerprint text not null,
  transfer_summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists family_merge_operations_performed_by_idx
  on public.family_merge_operations (performed_by, completed_at desc);

alter table public.family_merge_operations enable row level security;

create table if not exists public.family_invite_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users (id) on delete cascade not null,
  actor_user_id uuid references auth.users (id) on delete cascade not null,
  family_id uuid references public.families (id) on delete cascade not null,
  family_name text not null,
  source_family_name text,
  created_at timestamptz not null default now(),
  email_claimed_at timestamptz,
  email_sent_at timestamptz
);

create index if not exists family_invite_notifications_actor_idx
  on public.family_invite_notifications (actor_user_id, created_at desc);

alter table public.family_invite_notifications enable row level security;

-- Storage objects are deliberately not renamed during a database transaction:
-- Supabase Storage is an external service and cannot be rolled back together
-- with the merge. Keep the verified old path per document instead, so merged
-- documents remain signable without turning their file_url into a cross-family
-- signing oracle.
create table if not exists public.family_merge_document_paths (
  document_id uuid primary key references public.documents (id) on delete cascade,
  family_id uuid references public.families (id) on delete cascade not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists family_merge_document_paths_family_idx
  on public.family_merge_document_paths (family_id);

alter table public.family_merge_document_paths enable row level security;

drop policy if exists "family_merge_document_paths_select"
  on public.family_merge_document_paths;
create policy "family_merge_document_paths_select"
  on public.family_merge_document_paths for select
  using (public.user_belongs_to_family(family_id));

create or replace function public.get_family_invite_merge_preview(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_family_id uuid;
  v_source public.families%rowtype;
  v_membership_count integer;
  v_processing_document_count integer;
  v_document_count integer;
  v_task_count integer;
  v_calendar_event_count integer;
  v_member_count integer;
  v_collection_count integer;
  v_inventory_item_count integer;
  v_target_adult_count integer;
  v_fingerprint text;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select i.family_id into v_target_family_id
  from public.family_invites i
  where i.token = p_token
    and i.revoked_at is null
    and i.expires_at > now();

  if v_target_family_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if exists (
    select 1 from public.family_memberships
    where family_id = v_target_family_id and user_id = v_user_id
  ) then
    return jsonb_build_object('status', 'joined');
  end if;

  select * into v_source
  from public.families
  where created_by = v_user_id;

  if v_source.id is null then
    return jsonb_build_object('status', 'joinable');
  end if;

  select count(*) into v_membership_count
  from public.family_memberships
  where family_id = v_source.id;

  if v_membership_count > 1 then
    return jsonb_build_object('status', 'shared_source_family');
  end if;

  select count(*) into v_processing_document_count
  from public.documents
  where family_id = v_source.id
    and status in ('uploaded', 'ocr_processing', 'analyzing');

  if v_processing_document_count > 0 then
    return jsonb_build_object(
      'status', 'source_processing',
      'processing_document_count', v_processing_document_count
    );
  end if;

  select
    (select count(*) from public.documents where family_id = v_source.id),
    (select count(*) from public.tasks where family_id = v_source.id),
    (select count(*) from public.calendar_events where family_id = v_source.id),
    (select count(*) from public.family_members where family_id = v_source.id),
    (select count(*) from public.collections where family_id = v_source.id),
    (select count(*) from public.family_inventory_items where family_id = v_source.id)
  into
    v_document_count,
    v_task_count,
    v_calendar_event_count,
    v_member_count,
    v_collection_count,
    v_inventory_item_count;

  select count(*) into v_target_adult_count
  from public.family_memberships
  where family_id = v_target_family_id
    and role in ('owner', 'adult');

  select md5(concat_ws(
    ':',
    v_source.id,
    v_target_family_id,
    v_document_count,
    v_task_count,
    v_calendar_event_count,
    v_member_count,
    v_collection_count,
    v_inventory_item_count,
    coalesce((select max(created_at)::text from public.documents where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.tasks where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.calendar_events where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.family_members where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.collections where family_id = v_source.id), ''),
    coalesce((select max(updated_at)::text from public.family_inventory_items where family_id = v_source.id), '')
  )) into v_fingerprint;

  return jsonb_build_object(
    'status', 'merge_available',
    'source_family_name', v_source.name,
    'document_count', v_document_count,
    'task_count', v_task_count,
    'calendar_event_count', v_calendar_event_count,
    'member_count', v_member_count,
    'collection_count', v_collection_count,
    'inventory_item_count', v_inventory_item_count,
    'target_adult_count', v_target_adult_count,
    'fingerprint', v_fingerprint
  );
end;
$$;

revoke all on function public.get_family_invite_merge_preview(text) from public;
grant execute on function public.get_family_invite_merge_preview(text) to authenticated;

create or replace function public.merge_owned_family_into_invite(
  p_token text,
  p_preview_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.family_invites%rowtype;
  v_source public.families%rowtype;
  v_membership_count integer;
  v_target_name text;
  v_processing_document_count integer;
  v_document_count integer;
  v_task_count integer;
  v_calendar_event_count integer;
  v_member_count integer;
  v_collection_count integer;
  v_inventory_item_count integer;
  v_current_fingerprint text;
  v_operation_id uuid;
  v_notification_id uuid;
  v_duplicate record;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select * into v_invite
  from public.family_invites
  where token = p_token
    and revoked_at is null
    and expires_at > now()
  for update;

  if v_invite.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if exists (
    select 1 from public.family_memberships
    where family_id = v_invite.family_id and user_id = v_user_id
  ) then
    return jsonb_build_object('status', 'joined');
  end if;

  select * into v_source
  from public.families
  where created_by = v_user_id
  for update;

  if v_source.id is null then
    return jsonb_build_object('status', 'joinable');
  end if;

  if v_source.id = v_invite.family_id then
    return jsonb_build_object('status', 'joined');
  end if;

  select count(*) into v_membership_count
  from public.family_memberships
  where family_id = v_source.id;

  if v_membership_count > 1 then
    return jsonb_build_object('status', 'shared_source_family');
  end if;

  select count(*) into v_processing_document_count
  from public.documents
  where family_id = v_source.id
    and status in ('uploaded', 'ocr_processing', 'analyzing');

  if v_processing_document_count > 0 then
    return jsonb_build_object(
      'status', 'source_processing',
      'processing_document_count', v_processing_document_count
    );
  end if;

  select
    (select count(*) from public.documents where family_id = v_source.id),
    (select count(*) from public.tasks where family_id = v_source.id),
    (select count(*) from public.calendar_events where family_id = v_source.id),
    (select count(*) from public.family_members where family_id = v_source.id),
    (select count(*) from public.collections where family_id = v_source.id),
    (select count(*) from public.family_inventory_items where family_id = v_source.id)
  into
    v_document_count,
    v_task_count,
    v_calendar_event_count,
    v_member_count,
    v_collection_count,
    v_inventory_item_count;

  select md5(concat_ws(
    ':',
    v_source.id,
    v_invite.family_id,
    v_document_count,
    v_task_count,
    v_calendar_event_count,
    v_member_count,
    v_collection_count,
    v_inventory_item_count,
    coalesce((select max(created_at)::text from public.documents where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.tasks where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.calendar_events where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.family_members where family_id = v_source.id), ''),
    coalesce((select max(created_at)::text from public.collections where family_id = v_source.id), ''),
    coalesce((select max(updated_at)::text from public.family_inventory_items where family_id = v_source.id), '')
  )) into v_current_fingerprint;

  if p_preview_fingerprint is null
    or p_preview_fingerprint <> v_current_fingerprint then
    return jsonb_build_object('status', 'preview_changed');
  end if;

  -- Chat conversations and usage are deliberately not shared with a new
  -- family. All document, task, planner, people and collection data below
  -- keeps its IDs, preserving internal relationships.
  delete from public.chat_feedback_events where family_id = v_source.id;
  delete from public.chat_action_executions where family_id = v_source.id;
  delete from public.chat_usage where family_id = v_source.id;
  delete from public.chat_conversations where family_id = v_source.id;
  delete from public.processing_jobs where family_id = v_source.id;
  delete from public.calendar_feed_tokens where family_id = v_source.id;

  -- Person and organisation labels have a per-family uniqueness rule.
  -- Repoint each source node's edges to its existing target equivalent
  -- before deletion. This preserves graph relationships rather than
  -- cascading them away when two families used the same label.
  for v_duplicate in
    select source_node.id as source_id, target_node.id as target_id
    from public.knowledge_nodes source_node
    join public.knowledge_nodes target_node
      on target_node.family_id = v_invite.family_id
      and target_node.type = source_node.type
      and target_node.label = source_node.label
    where source_node.family_id = v_source.id
      and source_node.type in ('person', 'organization')
  loop
    update public.knowledge_edges
    set source_node_id = v_duplicate.target_id
    where family_id = v_source.id
      and source_node_id = v_duplicate.source_id;

    update public.knowledge_edges
    set target_node_id = v_duplicate.target_id
    where family_id = v_source.id
      and target_node_id = v_duplicate.source_id;

    delete from public.knowledge_nodes where id = v_duplicate.source_id;
  end loop;

  insert into public.family_merge_document_paths (
    document_id,
    family_id,
    file_url
  )
  select id, v_invite.family_id, file_url
  from public.documents
  where family_id = v_source.id
    and file_url is not null
  on conflict (document_id) do update
  set family_id = excluded.family_id,
      file_url = excluded.file_url;

  update public.documents set family_id = v_invite.family_id where family_id = v_source.id;
  update public.extracted_entities set family_id = v_invite.family_id where family_id = v_source.id;
  update public.tasks set family_id = v_invite.family_id where family_id = v_source.id;
  update public.task_documents set family_id = v_invite.family_id where family_id = v_source.id;
  update public.document_embeddings set family_id = v_invite.family_id where family_id = v_source.id;
  update public.document_facts set family_id = v_invite.family_id where family_id = v_source.id;
  update public.knowledge_nodes set family_id = v_invite.family_id where family_id = v_source.id;
  update public.knowledge_edges set family_id = v_invite.family_id where family_id = v_source.id;
  update public.calendar_events set family_id = v_invite.family_id where family_id = v_source.id;
  update public.calendar_suggestion_dismissals set family_id = v_invite.family_id where family_id = v_source.id;
  -- Collections link documents by their case-insensitive name. A matching
  -- target collection already covers the source documents after the family
  -- transfer, so retain the target row and discard only the duplicate.
  delete from public.collections source_collection
  using public.collections target_collection
  where source_collection.family_id = v_source.id
    and target_collection.family_id = v_invite.family_id
    and lower(source_collection.name) = lower(target_collection.name);
  update public.collections set family_id = v_invite.family_id where family_id = v_source.id;
  update public.family_members set family_id = v_invite.family_id where family_id = v_source.id;
  update public.family_inventory_items
  set family_id = v_invite.family_id
  where family_id = v_source.id;

  insert into public.family_merge_operations (
    source_family_id,
    target_family_id,
    performed_by,
    preview_fingerprint,
    transfer_summary
  )
  values (
    v_source.id,
    v_invite.family_id,
    v_user_id,
    v_current_fingerprint,
    jsonb_build_object(
      'documents', v_document_count,
      'tasks', v_task_count,
      'calendar_events', v_calendar_event_count,
      'members', v_member_count,
      'collections', v_collection_count,
      'inventory_items', v_inventory_item_count,
      'chat_history_deleted', true
    )
  )
  returning id into v_operation_id;

  insert into public.family_memberships (family_id, user_id, role)
  values (v_invite.family_id, v_user_id, v_invite.role)
  on conflict (family_id, user_id) do nothing;

  select name into v_target_name from public.families where id = v_invite.family_id;
  if v_invite.created_by is not null and v_invite.created_by <> v_user_id then
    insert into public.family_invite_notifications (
      recipient_user_id,
      actor_user_id,
      family_id,
      family_name,
      source_family_name
    )
    values (
      v_invite.created_by,
      v_user_id,
      v_invite.family_id,
      v_target_name,
      v_source.name
    )
    returning id into v_notification_id;
  end if;

  delete from public.family_memberships
  where family_id = v_source.id and user_id = v_user_id;
  delete from public.families where id = v_source.id;

  return jsonb_build_object(
    'status', 'merged',
    'family_id', v_invite.family_id,
    'family_name', v_target_name,
    'operation_id', v_operation_id,
    'notification_id', v_notification_id
  );
end;
$$;

revoke all on function public.merge_owned_family_into_invite(text, text) from public;
grant execute on function public.merge_owned_family_into_invite(text, text) to authenticated;

-- Preserve the existing RPC interface while directing accounts with an owned
-- family to the explicit merge screen rather than an opaque rejection.
create or replace function public.accept_family_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.family_invites%rowtype;
  v_user_id uuid := auth.uid();
  v_family_name text;
  v_owned_family_id uuid;
  v_owned_membership_count integer;
  v_processing_document_count integer;
  v_notification_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;

  select * into v_invite
  from public.family_invites
  where token = p_token
    and revoked_at is null
    and expires_at > now();

  if v_invite.id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  if exists (
    select 1 from public.family_memberships
    where family_id = v_invite.family_id and user_id = v_user_id
  ) then
    select name into v_family_name from public.families where id = v_invite.family_id;
    return jsonb_build_object(
      'status', 'joined', 'family_id', v_invite.family_id,
      'family_name', v_family_name
    );
  end if;

  select id into v_owned_family_id
  from public.families
  where created_by = v_user_id;

  if v_owned_family_id is not null then
    select count(*) into v_owned_membership_count
    from public.family_memberships
    where family_id = v_owned_family_id;

    if v_owned_membership_count > 1 then
      return jsonb_build_object('status', 'shared_source_family');
    end if;

    select count(*) into v_processing_document_count
    from public.documents
    where family_id = v_owned_family_id
      and status in ('uploaded', 'ocr_processing', 'analyzing');

    if v_processing_document_count > 0 then
      return jsonb_build_object(
        'status', 'source_processing',
        'processing_document_count', v_processing_document_count
      );
    end if;

    return jsonb_build_object('status', 'merge_required');
  end if;

  if exists (
    select 1 from public.family_memberships
    where user_id = v_user_id and family_id <> v_invite.family_id
  ) then
    return jsonb_build_object('status', 'already_in_family');
  end if;

  insert into public.family_memberships (family_id, user_id, role)
  values (v_invite.family_id, v_user_id, v_invite.role)
  on conflict (family_id, user_id) do nothing;

  select name into v_family_name from public.families where id = v_invite.family_id;
  if v_invite.created_by is not null and v_invite.created_by <> v_user_id then
    insert into public.family_invite_notifications (
      recipient_user_id,
      actor_user_id,
      family_id,
      family_name
    )
    values (
      v_invite.created_by,
      v_user_id,
      v_invite.family_id,
      v_family_name
    )
    returning id into v_notification_id;
  end if;
  return jsonb_build_object(
    'status', 'joined', 'family_id', v_invite.family_id,
    'family_name', v_family_name,
    'notification_id', v_notification_id
  );
end;
$$;

revoke all on function public.accept_family_invite(text) from public;
grant execute on function public.accept_family_invite(text) to authenticated;
