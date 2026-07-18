import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  validateFileWithSignature,
  uploadFamilyIdSchema,
  type UploadSuccessResponse,
  type UploadErrorResponse,
} from "@/lib/schemas/document";

/**
 * Maximum document uploads per family per day.
 *
 * Prevents cost runaway from mass uploads (OCR + LLM extraction per
 * document). 50/day is generous for a family app while blocking abuse.
 */
const DAILY_UPLOAD_LIMIT = 50;

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
 *   - Daily upload limit exceeded → 429 (UPLOAD_LIMIT_EXCEEDED)
 *
 * The Storage upload uses the admin (service-role) client, which bypasses
 * RLS. This is safe because we verify family ownership BEFORE uploading.
 * The documents row is inserted via the server client (RLS-scoped) so RLS
 * is enforced on the database insert as well.
 */
/**
 * The post-response pipeline drain (see step 7) runs OCR + analysis in
 * this same invocation — allow enough wall-clock for Datalab (10–60s)
 * plus the LLM extraction.
 */
export const maxDuration = 300;

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

  // 3. Validate file type, size, and magic-byte signature ---------------
  // Read the file's leading bytes for magic-byte validation.
  // This is a lightweight file-signature check that complements the MIME
  // type validation: instead of trusting File.type alone (which is set by
  // the browser and can be spoofed or incorrect), we verify the file's
  // leading bytes match the expected signature for the claimed format.
  //
  // We read the full file into memory (it's already buffered for the
  // Storage upload) and take the first 16 bytes. This is safe for the
  // 25 MB max file size and avoids platform-specific Blob.slice() issues.
  let headerBytes: Uint8Array;
  try {
    const fullBuffer = await file.arrayBuffer();
    headerBytes = new Uint8Array(fullBuffer, 0, Math.min(16, fullBuffer.byteLength));
  } catch {
    const body: UploadErrorResponse = {
      error: "Datei konnte nicht gelesen werden. Bitte erneut versuchen.",
      code: "FILE_READ_ERROR",
    };
    return Response.json(body, { status: 400 });
  }

  const validation = validateFileWithSignature(
    file.type,
    file.size,
    headerBytes,
  );
  if (!validation.valid) {
    const statusCode =
      validation.code === "FILE_TOO_LARGE" ? 413 : 400;
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

  // 4b. Check daily upload limit ------------------------------------------
  // Count documents created today for this family to prevent cost runaway
  // from mass uploads. Each document triggers OCR + LLM extraction.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayCount } = await serverClient
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId)
    .gte("created_at", todayStart.toISOString());

  if ((todayCount ?? 0) >= DAILY_UPLOAD_LIMIT) {
    const body: UploadErrorResponse = {
      error: `Tageslimit erreicht (${DAILY_UPLOAD_LIMIT} Dokumente pro Tag). Bitte morgen erneut versuchen.`,
      code: "UPLOAD_LIMIT_EXCEEDED",
    };
    return Response.json(body, { status: 429 });
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

  // 7. Async pipeline: enqueue the OCR job and process it in-band ----------
  // Default ON (opt out with PIPELINE_MODE=sync): enqueue an `ocr` job,
  // then — AFTER the response is sent (`next/server` after()) — drain the
  // queue in this same invocation. The pipeline therefore runs server-side
  // (OCR → analyze) even when the user locks their phone right after the
  // upload, without requiring any external scheduler. The client's own
  // OCR/analyze triggers stay race-safe either way (conditional status
  // transitions — whoever transitions first does the work, the other
  // no-ops), so this is purely additive. Any failure here must never fail
  // the upload itself.
  if (process.env.PIPELINE_MODE !== "sync") {
    try {
      const { enqueueJob, runPendingJobs } = await import("@/lib/jobs");
      await enqueueJob(adminClient, {
        family_id: familyId,
        document_id: documentId,
        job_type: "ocr",
      });

      const { after } = await import("next/server");
      after(async () => {
        try {
          // Drain rounds: ocr → (chains) analyze → empty. Capped so a
          // misbehaving queue can never keep the function alive forever.
          for (let round = 0; round < 5; round++) {
            const summary = await runPendingJobs(adminClient, 3);
            if (summary.claimed === 0) break;
          }
        } catch (err) {
          // Jobs stay pending — the retry/backoff worker and the
          // client-triggered pipeline both cover for this.
          console.error("[upload] pipeline drain failed:", err);
        }
      });
    } catch (err) {
      console.error("[upload] pipeline enqueue failed:", err);
    }
  }

  // 8. Success ------------------------------------------------------------
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
