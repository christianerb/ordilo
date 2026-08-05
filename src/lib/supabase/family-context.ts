/**
 * Request headers the middleware uses to hand its verified family lookup
 * over to page renders (see src/lib/supabase/middleware.ts). On full page
 * loads of app routes the middleware already queries `families` for the
 * onboarding gate — forwarding the result lets pages skip re-running the
 * identical query (one less Supabase round-trip per load).
 *
 * These headers must never be trusted from the client: the middleware
 * strips any incoming values and only re-sets them after its own
 * RLS-scoped query.
 *
 * Kept import-free so both the middleware (no next/headers allowed) and
 * server components can share the constants.
 */
export const FAMILY_ID_HEADER = "x-ordilo-family-id";
export const FAMILY_NAME_HEADER = "x-ordilo-family-name";

/**
 * The authenticated user's email, forwarded alongside the family headers
 * (the middleware already resolved the user via auth.getUser()). Lets the
 * app layout build the sidebar profile without its own auth round-trip.
 * Only set when a family was found; stripped from incoming requests.
 */
export const USER_EMAIL_HEADER = "x-ordilo-user-email";
