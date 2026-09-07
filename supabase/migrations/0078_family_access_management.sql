-- Account access is distinct from the people whose documents a family stores.
-- Return account identities only to current members; never expose invite tokens.
create or replace function public.get_family_access(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null or not public.user_belongs_to_family(p_family_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select created_by into v_owner from public.families where id = p_family_id;
  return jsonb_build_object(
    'status', 'ok',
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'is_owner', u.id = v_owner,
        'is_self', u.id = auth.uid()
      ) order by u.id = v_owner desc, m.created_at)
      from public.family_memberships m join auth.users u on u.id = m.user_id
      where m.family_id = p_family_id
    ), '[]'::jsonb),
    'invites', case when auth.uid() = v_owner then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'expires_at', i.expires_at) order by i.created_at desc)
      from public.family_invites i
      where i.family_id = p_family_id and i.revoked_at is null and i.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.get_family_access(uuid) from public;
grant execute on function public.get_family_access(uuid) to authenticated;

create or replace function public.revoke_family_access(p_family_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.families where id = p_family_id and created_by = auth.uid()
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('status', 'owner_protected');
  end if;
  if not exists (
    select 1 from public.family_memberships where family_id = p_family_id and user_id = p_user_id
  ) then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- Lock/revoke all links before deleting membership. Invite acceptance locks the
  -- same rows, so an in-flight join cannot resurrect access after this commits.
  update public.family_invites set revoked_at = now()
    where family_id = p_family_id and revoked_at is null;
  delete from public.family_memberships where family_id = p_family_id and user_id = p_user_id;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke all on function public.revoke_family_access(uuid, uuid) from public;
grant execute on function public.revoke_family_access(uuid, uuid) to authenticated;

create or replace function public.revoke_family_invite(p_family_id uuid, p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.families where id = p_family_id and created_by = auth.uid()
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  update public.family_invites set revoked_at = coalesce(revoked_at, now())
    where family_id = p_family_id and id = p_invite_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke all on function public.revoke_family_invite(uuid, uuid) from public;
grant execute on function public.revoke_family_invite(uuid, uuid) to authenticated;

-- Only the creator manages invitation links. Members can still see account access.
drop policy if exists "family_invites_select" on public.family_invites;
create policy "family_invites_select" on public.family_invites for select using (
  exists (select 1 from public.families f where f.id = family_id and f.created_by = auth.uid())
);

-- The creator remains responsible for this family and cannot remove themselves.
drop policy if exists "family_memberships_delete" on public.family_memberships;
create policy "family_memberships_delete" on public.family_memberships for delete using (
  not exists (select 1 from public.families f where f.id = family_id and f.created_by = user_id)
  and (user_id = auth.uid() or exists (
    select 1 from public.families f where f.id = family_id and f.created_by = auth.uid()
  ))
);

-- Keep the established merge/notification behavior, adding a row lock shared
-- with revocation. PostgreSQL rechecks revoked_at after waiting for the lock.
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
