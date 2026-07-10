import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { validateAvatarFile } from "@/lib/schemas/avatar";

/** How long the signed URL stays valid, in seconds. */
const SIGNED_URL_TTL_SECONDS = 300;

type PhotoErrorResponse = { error: string; code: string };
type PhotoSuccessResponse = { url: string };

/**
 * Resolve a family member by ID, scoped to the authenticated user's
 * family (RLS). Returns a 403/404-style error when the member doesn't
 * exist or belongs to a different family, without leaking which.
 */
async function resolveOwnedMember(
  serverClient: Awaited<ReturnType<typeof createServerClient>>,
  memberId: string,
): Promise<
  | { member: { id: string; family_id: string; photo_url: string | null }; error: null }
  | { member: null; error: { status: number; body: PhotoErrorResponse } }
> {
  const { data, error } = await serverClient
    .from("family_members")
    .select("id, family_id, photo_url")
    .eq("id", memberId)
    .maybeSingle();

  if (error || !data) {
    return {
      member: null,
      error: {
        status: 404,
        body: { error: "Person nicht gefunden.", code: "MEMBER_NOT_FOUND" },
      },
    };
  }

  return { member: data, error: null };
}

/**
 * POST /api/family-members/[id]/photo
 *
 * Accepts multipart form data with a single `file` field (JPEG/PNG/WebP,
 * ≤ 5 MB). Uploads it to the private "avatars" Storage bucket at
 * {family_id}/{member_id}/{filename}, replacing any previous photo, and
 * persists the storage path on `family_members.photo_url`.
 *
 * Returns a short-lived signed URL so the client can render the new photo
 * immediately without a page reload.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: memberId } = await params;
  const serverClient = await createServerClient();

  const resolved = await resolveOwnedMember(serverClient, memberId);
  if (resolved.error) {
    return Response.json(resolved.error.body, { status: resolved.error.status });
  }
  const member = resolved.member;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const body: PhotoErrorResponse = {
      error: "Ungültige Anfrage. Bitte ein Foto hochladen.",
      code: "INVALID_FORM_DATA",
    };
    return Response.json(body, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    const body: PhotoErrorResponse = {
      error: "Keine Datei gefunden. Bitte ein Foto auswählen.",
      code: "NO_FILE",
    };
    return Response.json(body, { status: 400 });
  }

  let headerBytes: Uint8Array;
  let fullBuffer: ArrayBuffer;
  try {
    fullBuffer = await file.arrayBuffer();
    headerBytes = new Uint8Array(fullBuffer, 0, Math.min(16, fullBuffer.byteLength));
  } catch {
    const body: PhotoErrorResponse = {
      error: "Datei konnte nicht gelesen werden. Bitte erneut versuchen.",
      code: "FILE_READ_ERROR",
    };
    return Response.json(body, { status: 400 });
  }

  const validation = validateAvatarFile(file.type, file.size, headerBytes);
  if (!validation.valid) {
    const statusCode = validation.code === "FILE_TOO_LARGE" ? 413 : 400;
    const body: PhotoErrorResponse = { error: validation.error, code: validation.code };
    return Response.json(body, { status: statusCode });
  }

  const adminClient = createAdminClient();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo";
  const storagePath = `${member.family_id}/${member.id}/${Date.now()}_${safeFilename}`;

  const { error: uploadError } = await adminClient.storage
    .from("avatars")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    const body: PhotoErrorResponse = {
      error: "Upload fehlgeschlagen. Bitte erneut versuchen.",
      code: "STORAGE_UPLOAD_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  const { error: updateError } = await serverClient
    .from("family_members")
    .update({ photo_url: storagePath })
    .eq("id", member.id);

  if (updateError) {
    await adminClient.storage.from("avatars").remove([storagePath]);
    const body: PhotoErrorResponse = {
      error: "Foto konnte nicht gespeichert werden. Bitte erneut versuchen.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // Clean up the previous photo now that the new one is persisted.
  if (member.photo_url) {
    await adminClient.storage.from("avatars").remove([member.photo_url]);
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from("avatars")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    const body: PhotoErrorResponse = {
      error: "Foto wurde gespeichert, konnte aber nicht angezeigt werden.",
      code: "SIGNED_URL_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  const body: PhotoSuccessResponse = { url: signed.signedUrl };
  return Response.json(body, { status: 200 });
}

/**
 * DELETE /api/family-members/[id]/photo
 *
 * Removes the member's profile photo: deletes the Storage object and
 * clears `family_members.photo_url`.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: memberId } = await params;
  const serverClient = await createServerClient();

  const resolved = await resolveOwnedMember(serverClient, memberId);
  if (resolved.error) {
    return Response.json(resolved.error.body, { status: resolved.error.status });
  }
  const member = resolved.member;

  const { error: updateError } = await serverClient
    .from("family_members")
    .update({ photo_url: null })
    .eq("id", member.id);

  if (updateError) {
    const body: PhotoErrorResponse = {
      error: "Foto konnte nicht entfernt werden. Bitte erneut versuchen.",
      code: "DB_UPDATE_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  if (member.photo_url) {
    const adminClient = createAdminClient();
    await adminClient.storage.from("avatars").remove([member.photo_url]);
  }

  return Response.json({ success: true }, { status: 200 });
}
