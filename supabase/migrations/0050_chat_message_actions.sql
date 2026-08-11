-- Pending chat action cards: when the assistant proposes a write (action
-- card), the proposal is stored on the assistant message so a page reload
-- restores the card instead of leaving text that points at nothing.
-- Only proposals travel here (tool_name + action_args); their resolution
-- state stays client-side — a stale "ready" card is safe because the
-- confirmation endpoint's idempotency ledger rejects duplicate writes.
-- Idempotent: safe to run more than once.

alter table public.chat_messages
  add column if not exists actions jsonb;
