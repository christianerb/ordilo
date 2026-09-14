import { requireUser } from "@/lib/auth/require-user";
import { syncRevenueCatEntitlement } from "@/lib/billing/revenuecat";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const client = await createServerClient();
  const { data: membership } = await client
    .from("family_memberships")
    .select("family_id")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return Response.json(
      { error: "Keine Familie gefunden.", code: "NO_FAMILY" },
      { status: 403 },
    );
  }

  try {
    const result = await syncRevenueCatEntitlement(membership.family_id);
    return Response.json({ active: result.active });
  } catch {
    return Response.json(
      { error: "Das Abo konnte noch nicht bestätigt werden.", code: "BILLING_SYNC_FAILED" },
      { status: 503 },
    );
  }
}
