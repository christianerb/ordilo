import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteLanding } from "./invite-landing";

/**
 * Invite landing page — `/invite/[token]`.
 *
 * Two states:
 *   - Signed in: the invite is accepted immediately (idempotent RPC) and
 *     the user lands on /home — zero clicks.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Signed in → accept immediately (idempotent) and go home.
    const { data } = await supabase.rpc("accept_family_invite", {
      p_token: token,
    });
    const status = (data as { status?: string } | null)?.status;

    if (status === "joined") {
      redirect("/home");
    }

    return (
      <InviteLanding
        token={token}
        familyName={null}
        state={status === "already_in_family" ? "already_in_family" : "invalid"}
      />
    );
  }

  // Signed out → resolve the family name for the landing card.
  const { data: info } = await supabase.rpc("get_family_invite_info", {
    p_token: token,
  });
  const infoResult = info as { status?: string; family_name?: string } | null;

  if (!infoResult || infoResult.status !== "valid") {
    return <InviteLanding token={token} familyName={null} state="invalid" />;
  }

  return (
    <InviteLanding
      token={token}
      familyName={infoResult.family_name ?? null}
      state="valid"
    />
  );
}
