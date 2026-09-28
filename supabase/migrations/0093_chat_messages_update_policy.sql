-- Repair the family-scoped UPDATE policy on chat_messages.
--
-- "Antwort neu erstellen" rewrites the assistant row in place. On the
-- hosted database every such update matched zero rows while SELECT and
-- INSERT on the same row, with the same JWT, worked — the UPDATE policy
-- had drifted from the definition in 0014_chat_history_and_limits.sql,
-- so the repair silently failed with REPAIR_SAVE_FAILED.
--
-- Dropping and recreating the policy is idempotent and restores the
-- intended rule: a member of the owning family may update the row, and
-- may not move it to another family.

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_update" on public.chat_messages;

create policy "chat_messages_update" on public.chat_messages
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));

-- The repair also touches the conversation timestamp. Recreate that
-- policy with the same definition so both halves of the write are
-- guaranteed to agree after this migration.
drop policy if exists "chat_conversations_update" on public.chat_conversations;

create policy "chat_conversations_update" on public.chat_conversations
  for update using (public.user_belongs_to_family(family_id))
  with check (public.user_belongs_to_family(family_id));
