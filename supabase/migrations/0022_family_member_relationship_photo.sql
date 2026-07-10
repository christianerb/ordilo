-- 0022_family_member_relationship_photo.sql
-- Adds a photo, and an optional relationship reference to another family
-- member, to family_members. Mirrors the existing role/birthdate fields.

alter table public.family_members
  add column if not exists photo_url text,
  add column if not exists related_member_id uuid references public.family_members (id) on delete set null,
  add column if not exists relationship_label text;

create index if not exists family_members_related_member_id_idx
  on public.family_members (related_member_id);

-- Private Storage bucket for member profile photos, following the same
-- pattern as the "documents" bucket (private, accessed via signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  null,
  null
)
on conflict (id) do nothing;
