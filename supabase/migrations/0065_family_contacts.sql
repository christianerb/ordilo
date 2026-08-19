-- Reusable family contacts, including suggestions extracted from documents.
--
-- Contact-shaped extracted_entities are mirrored into this table by a
-- trigger. While a document is still under review the row is a suggestion;
-- confirming the document promotes it to a confirmed contact in the same
-- transaction as the rest of the document confirmation.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete cascade,
  source_key text,
  name text not null check (char_length(trim(name)) > 0),
  organization text,
  role text,
  phone text,
  email text,
  status text not null default 'confirmed'
    check (status in ('suggested', 'confirmed')),
  user_edited_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);

alter table public.contacts
  add column if not exists user_edited_at timestamptz;

create unique index if not exists contacts_document_source_key_idx
  on public.contacts (family_id, source_document_id, source_key)
  where source_document_id is not null and source_key is not null;

create index if not exists contacts_family_name_idx
  on public.contacts (family_id, lower(name));

create index if not exists contacts_name_trgm_idx
  on public.contacts using gin (lower(name) gin_trgm_ops);
create index if not exists contacts_organization_trgm_idx
  on public.contacts using gin (lower(coalesce(organization, '')) gin_trgm_ops);
create index if not exists contacts_role_trgm_idx
  on public.contacts using gin (lower(coalesce(role, '')) gin_trgm_ops);

alter table public.contacts enable row level security;

drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts
  for select using (public.user_belongs_to_family(family_id));

drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts
  for insert with check (public.user_belongs_to_family(family_id));

drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));

drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts
  for delete using (public.user_belongs_to_family(family_id));

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_updated_at();

-- The supported invite flow records a family merge before deleting the
-- source family. Move contacts in that same transaction so their family
-- foreign key cannot cascade-delete them with the source family.
create or replace function public.transfer_contacts_for_family_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contacts
  set family_id = new.target_family_id
  where family_id = new.source_family_id;

  return new;
end;
$$;

revoke all on function public.transfer_contacts_for_family_merge() from public;

drop trigger if exists transfer_contacts_on_family_merge
  on public.family_merge_operations;
create trigger transfer_contacts_on_family_merge
after insert on public.family_merge_operations
for each row execute function public.transfer_contacts_for_family_merge();

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
    status = excluded.status,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_contact_entity on public.extracted_entities;
drop trigger if exists sync_contact_entity_insert on public.extracted_entities;
create trigger sync_contact_entity_insert
after insert on public.extracted_entities
for each row
when (new.entity_type = 'contact')
execute function public.sync_contact_from_entity();

drop trigger if exists sync_contact_entity_delete on public.extracted_entities;
create trigger sync_contact_entity_delete
after delete on public.extracted_entities
for each row
when (old.entity_type = 'contact')
execute function public.sync_contact_from_entity();

create or replace function public.search_family_contacts(
  p_family_id uuid,
  p_query text,
  p_limit int default 10
)
returns table (
  id uuid,
  name text,
  organization text,
  role text,
  phone text,
  email text
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.name, c.organization, c.role, c.phone, c.email
  from public.contacts c
  where c.family_id = p_family_id
    and c.status = 'confirmed'
    and public.user_belongs_to_family(c.family_id)
    and (
      lower(c.name) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.organization, '')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.role, '')) like '%' || lower(trim(p_query)) || '%'
    )
  order by c.name
  limit least(greatest(p_limit, 1), 25);
$$;

revoke execute on function public.search_family_contacts(uuid, text, int)
  from public;
grant execute on function public.search_family_contacts(uuid, text, int)
  to authenticated;
