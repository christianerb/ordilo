import { createClient } from "@/lib/supabase/server";
import { InviteLanding } from "./invite-landing";

/**
 * Invite landing page — `/invite/[token]`.
 *
 * Three states:
 *   - Signed in: a confirmation screen shows the family name; the invite
 *     is accepted only after the user explicitly clicks "Familie beitreten"
 *     (server action), never during a GET render — a shared link must not
 *     pull a signed-in visitor into a family unnoticed.
 *   - Signed out: shows who invited them (family name) and a one-field
 *     email form; the magic-link callback accepts the invite automatically
 *     (via the ordilo_invite cookie), so the invited person clicks the
 *     email link and is IN the family.
 *
 * Invalid/expired tokens render a friendly German error state.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // The info RPC is granted to anon + authenticated, so one lookup covers
  // both states; it never mutates anything.
  const [
    {
      data: { user },
    },
    { data: info },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_family_invite_info", { p_token: token }),
  ]);
  const infoResult = info as { status?: string; family_name?: string } | null;

  if (!infoResult || infoResult.status !== "valid") {
    return <InviteLanding token={token} familyName={null} state="invalid" />;
  }

  return (
    <InviteLanding
      token={token}
      familyName={infoResult.family_name ?? null}
      state={user ? "confirm" : "valid"}
    />
  );
}
