-- Cleanup: remove the temporary PKCE helper function.
DROP FUNCTION IF EXISTS public.get_latest_flow_state();
