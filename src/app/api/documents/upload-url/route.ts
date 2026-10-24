import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  DIRECT_UPLOAD_LIMIT,
  directUploadSchema,
  validateFile,
  type UploadErrorResponse,
} from "@/lib/schemas/document";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import {
  buildStoragePath,
  documentIdForUploadKey,
  sanitizeFilename,
} from "@/lib/api/storage";
import { refuseWithoutAiConsent } from "@/lib/ai/consent";

/**
 * POST /api/documents/upload-url
 *
 * Step 1 of the direct upload used by the native app: returns a signed
 * Storage upload URL so the file goes straight to Supabase Storage instead
 * of through this serverless function (whose request body is capped at
 * ~4.5 MB). That keeps full-resolution scans intact. Step 2 is
 * POST /api/documents/upload with the same JSON body, which validates the
 * stored file and creates the documents row.
 *
 * Body: { family_id, upload_key, filename, mime_type, size? }
 *
 * The object path is derived from family, user and upload key, so a
 * retry reuses it and a user can only write into their own per-key slot
 * of a family they belong to. An existing object is never overwritten.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    const body: UploadErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }
  const user = auth.user;

  const consentRefusal = await refuseWithoutAiConsent(user.id);
  if (consentRefusal) return consentRefusal;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Ungültige Anfrage.", "INVALID_BODY", 400);
  }
  const parsed = directUploadSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("Ungültige Anfrage.", "INVALID_BODY", 400);
  }
  const input = parsed.data;

  // Early, cheap check on the claimed type/size; the real bytes are
  // validated again when the upload is finalized.
  const validation = validateFile(
    input.mime_type,
    input.size ?? 0,
    DIRECT_UPLOAD_LIMIT,
  );
  if (!validation.valid) {
    const statusCode = validation.code === "FILE_TOO_LARGE" ? 413 : 400;
    return jsonError(validation.error, validation.code, statusCode);
  }

  const serverClient = await createServerClient();
  const { data: familyRow, error: familyError } = await serverClient
    .from("families")
    .select("id")
    .eq("id", input.family_id)
    .maybeSingle();
  if (familyError) {
    return jsonError(
      "Die Familie konnte gerade nicht geprüft werden. Bitte versuch es gleich erneut.",
      "FAMILY_CHECK_FAILED",
      503,
    );
  }
  if (!familyRow) {
    return jsonError("Kein Zugriff auf diese Familie.", "FAMILY_NOT_FOUND", 403);
  }

  const documentId = documentIdForUploadKey(
    input.family_id,
    user.id,
    input.upload_key,
  );
  const storagePath = buildStoragePath(
    input.family_id,
    documentId,
    sanitizeFilename(input.filename, "document"),
  );

  // Never overwrite: once a file sits in this slot it is final (the
  // finalize step validates it and removes it again if it is invalid).
  // A retry after a lost response just skips the transfer.
  const storage = createAdminClient().storage.from("documents");
  const { data: exists } = await storage.exists(storagePath);
  if (exists) {
    return Response.json({ storage_path: storagePath, already_uploaded: true });
  }

  const { data, error } = await storage.createSignedUploadUrl(storagePath, {
    upsert: false,
  });
  if (error || !data) {
    return jsonError(
      "Upload konnte nicht vorbereitet werden. Bitte erneut versuchen.",
      "UPLOAD_URL_FAILED",
      503,
    );
  }

  return Response.json({ signed_url: data.signedUrl, storage_path: storagePath });
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}
