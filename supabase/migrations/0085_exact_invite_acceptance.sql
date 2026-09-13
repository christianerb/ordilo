-- 0085_exact_invite_acceptance.sql
--
-- 0083 stamped the oldest still-open invite as accepted whenever any
-- membership appeared. With several open links that marks the wrong row:
-- redeeming the link labeled for Bob could mark Alice's older link as
-- accepted by Bob, and later uses of a multi-use link kept re-stamping
-- unrelated invites. The guess is replaced by the exact invite row, which
-- both join paths already hold in v_invite:
--   - accept_family_invite (direct join)
--   - merge_owned_family_into_invite (join that merges the own family)
--
-- Acceptance stays bookkeeping only: links remain multi-use until their
-- expiry or revocation, exactly as before.

drop trigger if exists family_invites_mark_accepted on public.family_memberships;
drop function if exists public.family_invites_mark_accepted();

-- ============================================================================
-- 1. accept_family_invite: stamp the redeemed invite, not the oldest one
-- ============================================================================
--
-- Same body as 0078 (row lock shared with revocation, merge guard rails,
-- invite notification) plus the exact-acceptance update after the
-- membership insert.

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
    and expires_at > now()
  for update;

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

  -- The exact link this account redeemed. The link stays redeemable for
  -- others (multi-use until expiry/revocation); this is owner bookkeeping.
  update public.family_invites
  set accepted_at = now(),
      accepted_by = v_user_id
  where id = v_invite.id
    and accepted_at is null;

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

-- ============================================================================
-- 2. merge_owned_family_into_invite: same exact stamping on the merge path
-- ============================================================================
--
-- Same body as 0055 (shared snapshot fingerprint, graph re-pointing,
-- transfer summary, source cleanup — notably without the dropped
-- family_inventory_items relation) plus the exact-acceptance update
-- after the membership insert.

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

  -- The exact link this account redeemed (see accept_family_invite).
  update public.family_invites
  set accepted_at = now(),
      accepted_by = v_user_id
  where id = v_invite.id
    and accepted_at is null;

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
