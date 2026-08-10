import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  buildStoragePath,
  readFileHeaderBytes,
  sanitizeFilename,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/api/storage";
import { jsonError } from "@/lib/api/respond";
import { validateAvatarFile } from "@/lib/schemas/avatar";
import type { ApiErrorResponse } from "@/lib/schemas/api";

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
  | { member: null; error: { status: number; body: ApiErrorResponse } }
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
    return jsonError(
      "Ungültige Anfrage. Bitte ein Foto hochladen.",
      "INVALID_FORM_DATA",
      400,
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return jsonError(
      "Keine Datei gefunden. Bitte ein Foto auswählen.",
      "NO_FILE",
      400,
    );
  }

  const header = await readFileHeaderBytes(file);
  if (!header.ok) return header.response;

  const validation = validateAvatarFile(file.type, file.size, header.headerBytes);
  if (!validation.valid) {
    const statusCode = validation.code === "FILE_TOO_LARGE" ? 413 : 400;
    return jsonError(validation.error, validation.code, statusCode);
  }

  const adminClient = createAdminClient();
  const safeFilename = sanitizeFilename(file.name, "photo");
  const storagePath = buildStoragePath(
    member.family_id,
    member.id,
    `${Date.now()}_${safeFilename}`,
  );

  const { error: uploadError } = await adminClient.storage
    .from("avatars")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return jsonError(
      "Upload fehlgeschlagen. Bitte erneut versuchen.",
      "STORAGE_UPLOAD_FAILED",
      500,
    );
  }

  const { error: updateError } = await serverClient
    .from("family_members")
    .update({ photo_url: storagePath })
    .eq("id", member.id);

  if (updateError) {
    await adminClient.storage.from("avatars").remove([storagePath]);
    return jsonError(
      "Foto konnte nicht gespeichert werden. Bitte erneut versuchen.",
      "DB_UPDATE_FAILED",
      500,
    );
  }

  // Clean up the previous photo now that the new one is persisted.
  if (member.photo_url) {
    await adminClient.storage.from("avatars").remove([member.photo_url]);
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from("avatars")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return jsonError(
      "Foto wurde gespeichert, konnte aber nicht angezeigt werden.",
      "SIGNED_URL_FAILED",
      500,
    );
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
    return jsonError(
      "Foto konnte nicht entfernt werden. Bitte erneut versuchen.",
      "DB_UPDATE_FAILED",
      500,
    );
  }

  if (member.photo_url) {
    const adminClient = createAdminClient();
    await adminClient.storage.from("avatars").remove([member.photo_url]);
  }

  return Response.json({ success: true }, { status: 200 });
}
