-- Add title column to chat_conversations for multi-chat support.
-- Titles are auto-generated from the first user message (server-side)
-- and can be manually edited by the user.

alter table public.chat_conversations
  add column if not exists title text;

-- Backfill: set title for existing conversations from their first user message.
update public.chat_conversations c
  set title = sub.first_message
  from (
    select
      cm.conversation_id,
      left(cm.content, 60) as first_message
    from public.chat_messages cm
    where cm.role = 'user'
    and cm.created_at = (
      select min(cm2.created_at)
      from public.chat_messages cm2
      where cm2.conversation_id = cm.conversation_id
    )
  ) sub
  where c.id = sub.conversation_id
  and c.title is null;
