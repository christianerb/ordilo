-- Repair the family-merge RPCs after inventory items became notes.
--
-- 0053 folded `family_inventory_items` into `documents` (type 'note') and
-- dropped the table. 0054 — written against the pre-0053 schema — still reads
-- `public.family_inventory_items` in both merge RPCs. PL/pgSQL resolves table
-- names at execution time, not at CREATE time, so 0054 applied cleanly and the
-- two functions instead raised on every single call:
--
--   ERROR: relation "public.family_inventory_items" does not exist (42P01)
--
-- What that broke: `accept_family_invite` never touches that table, so it
-- correctly answered "merge_required" for an invitee who already owns a
-- family — but the follow-up preview RPC raised, so the invite screen could
-- only report "Wir konnten deine Familie gerade nicht prüfen." There was no
-- way past it: `merge_owned_family_into_invite` raised for the same reason.
--
-- Inventory rows now live in `documents`, so `document_count` already covers
-- them and the separate `inventory_item_count` disappears from the preview
-- payload. Clients read it with a `?? 0` fallback, so an older deployed build
-- keeps working against the new payload.
--
-- The preview and the merge MUST derive the same fingerprint — a mismatch
-- makes every merge report "preview_changed". 0054 duplicated the formula in
-- both functions, which is exactly what let one copy rot against the schema
-- unnoticed. Both now read a single shared snapshot function.

-- ---------------------------------------------------------------------------
-- Shared merge snapshot: counts + the freshness fingerprint, in one place.
-- ---------------------------------------------------------------------------
--
-- Internal helper: not granted to anon or authenticated. It is called only
-- from the SECURITY DEFINER RPCs below, which run as this function's owner
-- and may therefore execute it. Keeping it ungranted means the per-invite
-- authorization checks in those RPCs cannot be bypassed by calling the
-- snapshot directly over PostgREST with an arbitrary pair of family ids.
create or replace function public.family_invite_merge_snapshot(
  p_source_family_id uuid,
  p_target_family_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with snapshot as (
    select
      (select count(*) from public.documents
         where family_id = p_source_family_id) as document_count,
      (select count(*) from public.tasks
         where family_id = p_source_family_id) as task_count,
      (select count(*) from public.calendar_events
         where family_id = p_source_family_id) as calendar_event_count,
      (select count(*) from public.family_members
         where family_id = p_source_family_id) as member_count,
      (select count(*) from public.collections
         where family_id = p_source_family_id) as collection_count,
      (select count(*) from public.family_memberships
         where family_id = p_target_family_id
           and role in ('owner', 'adult')) as target_adult_count,
      coalesce((
        select string_agg(user_id::text || ':' || role, ',' order by user_id)
        from public.family_memberships
        where family_id = p_target_family_id
      ), '') as target_membership_fingerprint,
      coalesce((select max(created_at)::text from public.documents
         where family_id = p_source_family_id), '') as documents_changed_at,
      coalesce((select max(created_at)::text from public.tasks
         where family_id = p_source_family_id), '') as tasks_changed_at,
      coalesce((select max(created_at)::text from public.calendar_events
         where family_id = p_source_family_id), '') as calendar_events_changed_at,
      coalesce((select max(created_at)::text from public.family_members
         where family_id = p_source_family_id), '') as members_changed_at,
      coalesce((select max(created_at)::text from public.collections
         where family_id = p_source_family_id), '') as collections_changed_at
  )
  select jsonb_build_object(
    'document_count', document_count,
    'task_count', task_count,
    'calendar_event_count', calendar_event_count,
    'member_count', member_count,
    'collection_count', collection_count,
    'target_adult_count', target_adult_count,
    'fingerprint', md5(concat_ws(
      ':',
      p_source_family_id,
      p_target_family_id,
      document_count,
      task_count,
      calendar_event_count,
      member_count,
      collection_count,
      target_adult_count,
      target_membership_fingerprint,
      documents_changed_at,
      tasks_changed_at,
      calendar_events_changed_at,
      members_changed_at,
      collections_changed_at
    ))
  )
  from snapshot;
$$;

revoke all on function public.family_invite_merge_snapshot(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Preview
-- ---------------------------------------------------------------------------

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
  v_snapshot jsonb;
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

  -- Own invite link: there is nothing to move, the account simply belongs
  -- to this family already. Without this the preview would offer to merge a
  -- family into itself, which the merge RPC then rejects.
  if v_source.id = v_target_family_id then
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

  v_snapshot := public.family_invite_merge_snapshot(v_source.id, v_target_family_id);

  return v_snapshot || jsonb_build_object(
    'status', 'merge_available',
    'source_family_name', v_source.name
  );
end;
$$;

revoke all on function public.get_family_invite_merge_preview(text) from public;
grant execute on function public.get_family_invite_merge_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Merge
-- ---------------------------------------------------------------------------

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
  v_snapshot jsonb;
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

  -- Hold the target family row while recomputing the preview fingerprint.
  -- Membership inserts take a foreign-key key-share lock on this row, so a
  -- newly added account cannot invalidate the reviewed access count halfway
  -- through the merge transaction.
  perform 1
  from public.families
  where id = v_invite.family_id
  for update;

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

  v_snapshot := public.family_invite_merge_snapshot(v_source.id, v_invite.family_id);

  if p_preview_fingerprint is null
    or p_preview_fingerprint <> (v_snapshot ->> 'fingerprint') then
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
    v_snapshot ->> 'fingerprint',
    jsonb_build_object(
      'documents', v_snapshot -> 'document_count',
      'tasks', v_snapshot -> 'task_count',
      'calendar_events', v_snapshot -> 'calendar_event_count',
      'members', v_snapshot -> 'member_count',
      'collections', v_snapshot -> 'collection_count',
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
