-- Temporary helper function for PKCE E2E testing.
-- Allows reading the auth_code from auth.flow_state so the PKCE callback
-- can be exercised end-to-end without reading the emailed magic link.
-- This function is dropped in the cleanup migration 0003.

CREATE OR REPLACE FUNCTION public.get_latest_flow_state()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT to_jsonb(t) FROM (
    SELECT * FROM auth.flow_state
    ORDER BY created_at DESC
    LIMIT 1
  ) t;
$$;
