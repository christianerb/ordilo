import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveMemberPhotoUrls } from "@/lib/member-photos";
import { jsonError } from "@/lib/api/respond";

/**
 * GET /api/family-members/photos?family_id=...
 *
 * Batch-resolves short-lived signed URLs for every member of a family that
 * has an uploaded photo. Used by the mobile app, which reads
 * `family_members` directly via Supabase (RLS) but has no service-role
 * access to sign Storage URLs itself.
 *
 * The `family_id` filter only narrows an already RLS-scoped query — a
 * caller who isn't a member of that family gets an empty result, not an
 * error, exactly like a direct Supabase select would.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const familyId = new URL(request.url).searchParams.get("family_id");
  if (!familyId) {
    return jsonError("family_id fehlt.", "MISSING_FAMILY_ID", 400);
  }

  const serverClient = await createServerClient();
  const { data, error } = await serverClient
    .from("family_members")
    .select("id, photo_url")
    .eq("family_id", familyId);

  if (error) {
    return jsonError(
      "Fotos konnten nicht geladen werden.",
      "QUERY_FAILED",
      500,
    );
  }

  const urls = await resolveMemberPhotoUrls(data ?? []);
  return Response.json({ urls }, { status: 200 });
}
