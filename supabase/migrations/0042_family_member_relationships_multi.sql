-- Replaces the single related_member_id with related_member_ids (uuid[]) so
-- one relationship label can apply to several people at once (e.g.
-- "Elternteil von" Emma AND Hanna at the same time), instead of only one.

alter table public.family_members
  add column if not exists related_member_ids uuid[] not null default '{}';

update public.family_members
set related_member_ids = array[related_member_id]
where related_member_id is not null;

drop index if exists family_members_related_member_id_idx;

alter table public.family_members
  drop column if exists related_member_id;

create index if not exists family_members_related_member_ids_idx
  on public.family_members using gin (related_member_ids);

-- A deleted member must disappear from everyone else's relationships too.
-- The old single-column FK did this automatically via ON DELETE SET NULL;
-- an array column has no such constraint, so a trigger takes over.
create or replace function public.remove_member_from_relationships()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update family_members
  set related_member_ids = array_remove(related_member_ids, old.id)
  where related_member_ids @> array[old.id];
  return old;
end;
$$;

drop trigger if exists family_members_cleanup_relationships on public.family_members;
create trigger family_members_cleanup_relationships
after delete on public.family_members
for each row
execute function public.remove_member_from_relationships();
