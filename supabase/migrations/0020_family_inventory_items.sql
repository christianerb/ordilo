-- Family inventory items — cars, insurance policies, bank accounts,
-- properties, contracts, or any other tangible/intangible asset that
-- belongs to the family and can be cross-referenced with documents.
--
-- Items can be:
--   1. Created manually by the user
--   2. Auto-detected from document uploads (suggested during confirm)
--   3. Linked to documents via extracted_entities (entity_type = 'inventory_item')
--   4. Linked to family members (e.g. "Emma's Krankenversicherung")

create table if not exists public.family_inventory_items (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid references public.families (id) on delete cascade not null,
  name            text not null,                    -- e.g. "BMW X3", "TK Krankenversicherung"
  item_type       text not null,                    -- vehicle | insurance | bank_account | property | contract | device | other
  metadata        jsonb not null default '{}'::jsonb, -- flexible: { license_plate, policy_number, iban, ... }
  tags            text[] not null default '{}',     -- user-defined tags
  linked_member_id uuid references public.family_members (id) on delete set null, -- which person this belongs to
  status          text not null default 'confirmed', -- confirmed | suggested (suggested = auto-detected, pending user approval)
  source_document_id uuid references public.documents (id) on delete set null, -- doc that triggered auto-detection
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes
create index if not exists family_inventory_items_family_id_idx
  on public.family_inventory_items (family_id);
create index if not exists family_inventory_items_linked_member_id_idx
  on public.family_inventory_items (linked_member_id);
create index if not exists family_inventory_items_status_idx
  on public.family_inventory_items (family_id, status);
create index if not exists family_inventory_items_type_idx
  on public.family_inventory_items (family_id, item_type);

-- RLS
alter table public.family_inventory_items enable row level security;

create policy "inventory_items_select" on public.family_inventory_items
  for select using (
    family_id in (
      select id from public.families where created_by = auth.uid()
    )
  );

create policy "inventory_items_insert" on public.family_inventory_items
  for insert with check (
    family_id in (
      select id from public.families where created_by = auth.uid()
    )
  );

create policy "inventory_items_update" on public.family_inventory_items
  for update using (
    family_id in (
      select id from public.families where created_by = auth.uid()
    )
  );

create policy "inventory_items_delete" on public.family_inventory_items
  for delete using (
    family_id in (
      select id from public.families where created_by = auth.uid()
    )
  );

-- Add 'inventory_item' as a valid entity_type in extracted_entities
-- (no constraint to alter — entity_type is free text, just convention)
-- When a document is confirmed and mentions an inventory item, the confirm
-- RPC will create an extracted_entity with entity_type = 'inventory_item'
-- and linked_object_id = the inventory item's id.
