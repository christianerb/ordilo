import { requireUser } from "@/lib/auth/require-user";
import { syncRevenueCatEntitlement } from "@/lib/billing/revenuecat";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveUserFamily } from "@/lib/supabase/resolve-user-family";
import { z } from "zod";

const bodySchema = z
  .object({
    family_id: z.string().uuid().optional(),
  })
  .nullish();

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) return Response.json(auth.json, { status: auth.status });

  const parsed = bodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Ungültige Anfrage.", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  const client = await createServerClient();
  const requestedFamilyId = parsed.data?.family_id ?? null;

  // The mobile BillingProvider uses the ACTIVE family as the RevenueCat
  // app user ID. Syncing an arbitrarily picked membership could therefore
  // update a different family than the one that just purchased.
  let familyId: string | null;
  if (requestedFamilyId) {
    const { data: membership, error } = await client
      .from("family_memberships")
      .select("family_id")
      .eq("user_id", auth.user.id)
      .eq("family_id", requestedFamilyId)
      .maybeSingle();
    if (error) {
      return Response.json(
        { error: "Die Familie konnte nicht geprüft werden.", code: "FAMILY_CHECK_FAILED" },
        { status: 503 },
      );
    }
    if (!membership) {
      return Response.json(
        { error: "Kein Zugriff auf diese Familie.", code: "FAMILY_ACCESS_DENIED" },
        { status: 403 },
      );
    }
    familyId = requestedFamilyId;
  } else {
    // Same deterministic rule the mobile client uses: owned family first,
    // otherwise the oldest membership.
    const resolved = await resolveUserFamily(client, auth.user.id);
    if (resolved.error) {
      return Response.json(
        { error: "Die Familie konnte nicht geladen werden.", code: "FAMILY_CHECK_FAILED" },
        { status: 503 },
      );
    }
    familyId = resolved.data?.id ?? null;
  }

  if (!familyId) {
    return Response.json(
      { error: "Keine Familie gefunden.", code: "NO_FAMILY" },
      { status: 403 },
    );
  }

  try {
    const result = await syncRevenueCatEntitlement(familyId);
    return Response.json({ active: result.active });
  } catch {
    return Response.json(
      { error: "Das Abo konnte noch nicht bestätigt werden.", code: "BILLING_SYNC_FAILED" },
      { status: 503 },
    );
  }
}
