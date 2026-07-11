/**
 * Shared invite-flow constants.
 */

/**
 * Cookie that carries the invite token across the magic-link round trip:
 * set when the invited user requests a sign-in email on /invite/[token],
 * read (and cleared) by /auth/callback, which accepts the invite right
 * after the session is established.
 */
export const INVITE_COOKIE = "ordilo_invite";
