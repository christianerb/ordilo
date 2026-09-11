-- GPT Live is a paid-only, session-metered feature. A session is capped at
-- five minutes in both clients; this monthly count bounds cost independently
-- of the normal chat-answer quota used by questions inside the conversation.

insert into public.billing_metrics (code, description)
values ('live_conversation', 'GPT Live voice conversation sessions')
on conflict (code) do update set description = excluded.description;

insert into public.billing_plan_limits (plan_code, metric_code, monthly_limit)
values
  ('free', 'live_conversation', 0),
  ('founding', 'live_conversation', 10),
  ('plus', 'live_conversation', 10)
on conflict (plan_code, metric_code) do update
set monthly_limit = excluded.monthly_limit,
    updated_at = now();
