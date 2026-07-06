-- Cleanup: remove the temporary PKCE helper function re-created in 0007.
-- The helper was used during auth-e2e-hardening to read the auth_code from
-- auth.flow_state for real PKCE callback testing without reading the
-- emailed magic link. It is no longer needed after testing is complete.
DROP FUNCTION IF EXISTS public.get_latest_flow_state();
