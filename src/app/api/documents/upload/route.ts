import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  validateFile,
  uploadFamilyIdSchema,
  type UploadSuccessResponse,
  type UploadErrorResponse,
} from "@/lib/schemas/document";

/**
 * POST /api/documents/upload
 *
 * Accepts multipart form data with:
 *   - file:    the document file (image or PDF)
 *   - family_id: the family to associate the document with
 *
 * Pipeline:
 *   1. Authenticate the user (requireUser → 401 if no session)
 *   2. Validate family_id belongs to the authenticated user (RLS)
 *   3. Validate the file type (images + PDF only) and size (≤ 25 MB)
 *   4. Upload the file to Supabase Storage at {family_id}/{document_id}/{filename}
 *   5. Create a `documents` row with status = "uploaded"
 *   6. Return { document_id, status: "uploaded" }
 *
 * Error handling:
 *   - If the Storage upload fails, NO documents row is created (no orphaned
 *     rows — VAL-CAPTURE-010).
 *   - Unsupported file types → 400 with UNSUPPORTED_FILE_TYPE (VAL-CAPTURE-008)
 *   - Oversized files → 413 with FILE_TOO_LARGE (VAL-CAPTURE-009)
 *   - Unauthenticated → 401 with UNAUTHENTICATED (VAL-CAPTURE-014)
 *   - Family ownership failure → 403 (VAL-CAPTURE-013)
 *
 * The Storage upload uses the admin (service-role) client, which bypasses
 * RLS. This is safe because we verify family ownership BEFORE uploading.
 * The documents row is inserted via the server client (RLS-scoped) so RLS
 * is enforced on the database insert as well.
 */
export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate --------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    const body: UploadErrorResponse = auth.json;
    return Response.json(body, { status: auth.status });
  }
  const user = auth.user;

  // 2. Parse multipart form data ------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const body: UploadErrorResponse = {
      error: "Ungültige Anfrage. Bitte eine Datei hochladen.",
      code: "INVALID_FORM_DATA",
    };
    return Response.json(body, { status: 400 });
  }

  const file = formData.get("file");
  const familyIdRaw = formData.get("family_id");

  // Verify a file was provided.
  if (!file || !(file instanceof File)) {
    const body: UploadErrorResponse = {
      error: "Keine Datei gefunden. Bitte eine Datei auswählen.",
      code: "NO_FILE",
    };
    return Response.json(body, { status: 400 });
  }

  // Validate family_id format.
  const familyIdParsed = uploadFamilyIdSchema.safeParse({
    family_id: familyIdRaw,
  });
  if (!familyIdParsed.success) {
    const body: UploadErrorResponse = {
      error: "Ungültige Familien-ID.",
      code: "INVALID_FAMILY_ID",
    };
    return Response.json(body, { status: 400 });
  }
  const familyId = familyIdParsed.data.family_id;

  // 3. Validate file type and size ----------------------------------------
  const validation = validateFile(file.type, file.size);
  if (!validation.valid) {
    const statusCode = validation.code === "FILE_TOO_LARGE" ? 413 : 400;
    const body: UploadErrorResponse = {
      error: validation.error,
      code: validation.code,
    };
    return Response.json(body, { status: statusCode });
  }

  // 4. Verify family ownership (RLS) --------------------------------------
  // Use the server client (RLS-scoped) to verify the user owns this family.
  const serverClient = await createServerClient();
  const { data: familyRow, error: familyError } = await serverClient
    .from("families")
    .select("id")
    .eq("id", familyId)
    .maybeSingle();

  if (familyError || !familyRow) {
    const body: UploadErrorResponse = {
      error: "Kein Zugriff auf diese Familie.",
      code: "FAMILY_NOT_FOUND",
    };
    return Response.json(body, { status: 403 });
  }

  // 5. Generate document ID and upload to Storage -------------------------
  const adminClient = createAdminClient();
  const documentId = crypto.randomUUID();

  // Build the Storage path: {family_id}/{document_id}/{filename}
  // Sanitize the filename to avoid path traversal issues.
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "document";
  const storagePath = `${familyId}/${documentId}/${safeFilename}`;

  const { error: uploadError } = await adminClient.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    // Storage upload failed — do NOT create a documents row (no orphaned rows).
    const body: UploadErrorResponse = {
      error: "Upload fehlgeschlagen. Bitte erneut versuchen.",
      code: "STORAGE_UPLOAD_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 6. Create the documents row (status = uploaded) ----------------------
  // Use the server client so RLS is enforced on the insert as well.
  const { data: docRow, error: insertError } = await serverClient
    .from("documents")
    .insert({
      id: documentId,
      family_id: familyId,
      uploaded_by: user.id,
      status: "uploaded",
      file_url: storagePath,
      original_filename: file.name,
      mime_type: file.type,
    })
    .select("id")
    .single();

  if (insertError || !docRow) {
    // DB insert failed — clean up the orphaned Storage object so we don't
    // leave a file with no corresponding document row.
    await adminClient.storage.from("documents").remove([storagePath]);

    const body: UploadErrorResponse = {
      error: "Dokument konnte nicht gespeichert werden. Bitte erneut versuchen.",
      code: "DB_INSERT_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 7. Success ------------------------------------------------------------
  const body: UploadSuccessResponse = {
    document_id: documentId,
    status: "uploaded",
  };
  return Response.json(body, { status: 200 });
}

/**
 * GET /api/documents/upload — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: UploadErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
