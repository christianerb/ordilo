-- Keep deleted document-derived contacts from returning on re-analysis.

alter table public.contacts
  drop constraint if exists contacts_status_check;

alter table public.contacts
  add constraint contacts_status_check
  check (status in ('suggested', 'confirmed', 'dismissed'));

create or replace function public.sync_contact_from_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    if old.entity_type = 'contact' then
      delete from public.contacts
      where family_id = old.family_id
        and source_document_id = old.document_id
        and source_key = old.normalized_value
        and user_edited_at is null;
    end if;
    return old;
  end if;

  if new.entity_type <> 'contact' then
    return new;
  end if;

  begin
    v_payload := new.entity_value::jsonb;
  exception when others then
    return new;
  end;

  -- A dismissed row is a tombstone. Match it by contact details rather
  -- than source_key because extraction order can change on re-analysis.
  if exists (
    select 1
    from public.contacts c
    where c.family_id = new.family_id
      and c.source_document_id = new.document_id
      and c.status = 'dismissed'
      and (
        (
          nullif(lower(trim(c.email)), '') is not null
          and lower(trim(c.email)) = lower(trim(v_payload->>'email'))
        )
        or (
          nullif(regexp_replace(c.phone, '[^0-9]', '', 'g'), '') is not null
          and regexp_replace(c.phone, '[^0-9]', '', 'g')
            = regexp_replace(v_payload->>'phone', '[^0-9]', '', 'g')
        )
        or (
          lower(trim(c.name)) = lower(trim(v_payload->>'name'))
          and coalesce(lower(trim(c.organization)), '')
            = coalesce(lower(trim(v_payload->>'organization')), '')
        )
      )
  ) then
    return new;
  end if;

  insert into public.contacts (
    family_id,
    source_document_id,
    source_key,
    name,
    organization,
    role,
    phone,
    email,
    status
  )
  values (
    new.family_id,
    new.document_id,
    new.normalized_value,
    trim(v_payload->>'name'),
    nullif(trim(v_payload->>'organization'), ''),
    nullif(trim(v_payload->>'role'), ''),
    nullif(trim(v_payload->>'phone'), ''),
    nullif(lower(trim(v_payload->>'email')), ''),
    case when new.confirmed then 'confirmed' else 'suggested' end
  )
  on conflict (family_id, source_document_id, source_key)
    where source_document_id is not null and source_key is not null
  do update set
    name = case
      when contacts.user_edited_at is null then excluded.name
      else contacts.name
    end,
    organization = case
      when contacts.user_edited_at is null then excluded.organization
      else contacts.organization
    end,
    role = case
      when contacts.user_edited_at is null then excluded.role
      else contacts.role
    end,
    phone = case
      when contacts.user_edited_at is null then excluded.phone
      else contacts.phone
    end,
    email = case
      when contacts.user_edited_at is null then excluded.email
      else contacts.email
    end,
    status = case
      when contacts.status = 'dismissed' then 'dismissed'
      else excluded.status
    end,
    updated_at = now();

  return new;
end;
$$;
