-- Scoped PKCE test helper for VAL-AUTH-008 E2E testing.
--
-- Replaces the former global get_latest_flow_state() helper (migrations
-- 0002/0007, dropped in 0003/0008) which was a SECURITY DEFINER function
-- with default PUBLIC execute. Any anon/authenticated caller could read
-- ANOTHER user's latest auth_code / code_challenge via PostgREST RPC.
--
-- This function is:
--   (a) Parameterized by the test user's email — returns ONLY that user's
--       latest auth.flow_state row, not a global "latest" row.
--   (b) Access-controlled: EXECUTE is revoked from PUBLIC, anon, and
--       authenticated and granted ONLY to service_role. It can never be
--       called from the anon/authenticated PostgREST client.
--
-- SECURITY WARNING: Supabase shared auth tables (auth.flow_state, auth.users)
-- must NEVER be exposed via a PUBLIC-executable helper. A SECURITY DEFINER
-- function over these tables without explicit REVOKE FROM PUBLIC lets any
-- anon/authenticated caller read other users' sensitive auth data.

CREATE OR REPLACE FUNCTION public.get_flow_state_for_user(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT to_jsonb(t) FROM (
    SELECT fs.*
    FROM auth.flow_state fs
    JOIN auth.users u ON u.id = fs.user_id
    WHERE u.email = p_email
    ORDER BY fs.created_at DESC
    LIMIT 1
  ) t;
$$;

-- Lock down: revoke execute from all default-accessible roles.
REVOKE EXECUTE ON FUNCTION public.get_flow_state_for_user(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_flow_state_for_user(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_flow_state_for_user(TEXT) FROM authenticated;

-- Grant execute ONLY to service_role (used server-side with the service
-- role key, never exposed to the browser client).
GRANT EXECUTE ON FUNCTION public.get_flow_state_for_user(TEXT) TO service_role;
