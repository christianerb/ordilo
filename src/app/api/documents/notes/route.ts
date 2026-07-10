import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import {
  validateFileWithSignature,
  IMAGE_MIME_TYPES,
  type UploadErrorResponse,
} from "@/lib/schemas/document";
import { DOCUMENT_TYPES } from "@/lib/schemas/extraction";
import type { Database } from "@/types/database";

/**
 * Success response for POST /api/documents/notes.
 * Status is "ocr_done" because the note text is already available (no OCR needed).
 */
type NoteSuccessResponse = {
  document_id: string;
  status: "ocr_done";
};

/**
 * POST /api/documents/notes
 *
 * Creates a manually-authored document (a "note") with user-written text
 * and an optional image attachment. The note text is stored as ocr_text
 * and a document_pages row so the existing analysis pipeline can process
 * it without modification — the document is created with status
 * "ocr_done" (text already available, no OCR needed), then the client
 * triggers analysis via POST /api/documents/[id]/analyze.
 *
 * Accepts multipart form data with:
 *   - title:         the note title (required, 1–200 chars)
 *   - content:       markdown text body (required, 1–10 000 chars)
 *   - document_type: one of the DOCUMENT_TYPES enum values (required)
 *   - family_id:     the family to associate with (required, UUID)
 *   - file:          optional image attachment (JPEG, PNG, WebP, GIF)
 *
 * Pipeline:
 *   1. Authenticate the user
 *   2. Validate form fields with Zod
 *   3. Verify family ownership (RLS)
 *   4. If image provided: validate + upload to Storage
 *   5. Insert documents row (status = "ocr_done", source = "manual",
 *      ocr_text = content)
 *   6. Insert document_pages row (page_number = 1, ocr_markdown = content)
 *   7. Return { document_id, status: "ocr_done" }
 *
 * Error handling mirrors the upload route:
 *   - If Storage upload fails, NO documents row is created (no orphan).
 *   - If the documents insert fails, the Storage object is cleaned up.
 */

const noteSchema = z.object({
  title: z
    .string()
    .min(1, "Titel darf nicht leer sein.")
    .max(200, "Titel ist zu lang (max. 200 Zeichen)."),
  content: z
    .string()
    .min(1, "Notiz darf nicht leer sein.")
    .max(10_000, "Notiz ist zu lang (max. 10 000 Zeichen)."),
  document_type: z.enum(DOCUMENT_TYPES),
  family_id: z.string().uuid("Ungültige Familien-ID."),
});

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
      error: "Ungültige Anfrage.",
      code: "INVALID_FORM_DATA",
    };
    return Response.json(body, { status: 400 });
  }

  const title = formData.get("title");
  const content = formData.get("content");
  const documentType = formData.get("document_type");
  const familyIdRaw = formData.get("family_id");
  const file = formData.get("file");

  const parsed = noteSchema.safeParse({
    title: typeof title === "string" ? title : "",
    content: typeof content === "string" ? content : "",
    document_type: typeof documentType === "string" ? documentType : "",
    family_id: typeof familyIdRaw === "string" ? familyIdRaw : "",
  });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    const body: UploadErrorResponse = {
      error: firstError?.message ?? "Eingabe ungültig.",
      code: "VALIDATION_ERROR",
    };
    return Response.json(body, { status: 400 });
  }

  const { title: validTitle, content: validContent, document_type: validType, family_id: familyId } = parsed.data;

  // 3. Verify family ownership (RLS) --------------------------------------
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

  // 4. Optional image upload ----------------------------------------------
  const adminClient = createAdminClient();
  const documentId = crypto.randomUUID();
  let storagePath: string | null = null;
  let mimeType: string | null = null;
  let originalFilename: string | null = null;

  if (file && file instanceof File && file.size > 0) {
    // Read header bytes for signature validation.
    let headerBytes: Uint8Array;
    try {
      const fullBuffer = await file.arrayBuffer();
      headerBytes = new Uint8Array(fullBuffer, 0, Math.min(16, fullBuffer.byteLength));
    } catch {
      const body: UploadErrorResponse = {
        error: "Datei konnte nicht gelesen werden.",
        code: "FILE_READ_ERROR",
      };
      return Response.json(body, { status: 400 });
    }

    const validation = validateFileWithSignature(file.type, file.size, headerBytes);
    if (!validation.valid) {
      const statusCode = validation.code === "FILE_TOO_LARGE" ? 413 : 400;
      const body: UploadErrorResponse = {
        error: validation.error,
        code: validation.code,
      };
      return Response.json(body, { status: statusCode });
    }

    // Only allow images for note attachments (no PDF — a note is text-based).
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(validation.mimeType)) {
      const body: UploadErrorResponse = {
        error: "Nur Bilder können an eine Notiz angehängt werden.",
        code: "UNSUPPORTED_FILE_TYPE",
      };
      return Response.json(body, { status: 400 });
    }

    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment";
    storagePath = `${familyId}/${documentId}/${safeFilename}`;
    mimeType = validation.mimeType;
    originalFilename = file.name;

    const { error: uploadError } = await adminClient.storage
      .from("documents")
      .upload(storagePath, file, {
        contentType: validation.mimeType,
        upsert: false,
      });

    if (uploadError) {
      const body: UploadErrorResponse = {
        error: "Bild konnte nicht hochgeladen werden.",
        code: "STORAGE_UPLOAD_FAILED",
      };
      return Response.json(body, { status: 500 });
    }
  }

  // 5. Insert documents row ------------------------------------------------
  const insertPayload: Database["public"]["Tables"]["documents"]["Insert"] = {
    id: documentId,
    family_id: familyId,
    uploaded_by: user.id,
    status: "ocr_done",
    source: "manual",
    title: validTitle,
    document_type: validType,
    ocr_text: validContent,
    mime_type: mimeType,
    original_filename: originalFilename,
    page_count: 1,
  };
  if (storagePath) {
    insertPayload.file_url = storagePath;
  }

  const { data: docRow, error: insertError } = await serverClient
    .from("documents")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError || !docRow) {
    // Clean up orphaned Storage object.
    if (storagePath) {
      await adminClient.storage.from("documents").remove([storagePath]).catch(() => {});
    }
    const body: UploadErrorResponse = {
      error: "Notiz konnte nicht gespeichert werden.",
      code: "DB_INSERT_FAILED",
    };
    return Response.json(body, { status: 500 });
  }

  // 6. Insert document_pages row ------------------------------------------
  const { error: pageError } = await serverClient
    .from("document_pages")
    .insert({
      document_id: documentId,
      page_number: 1,
      ocr_markdown: validContent,
      image_url: storagePath,
    });

  if (pageError) {
    // Non-fatal: the document row exists and ocr_text is set, which is
    // sufficient for the analysis pipeline (it falls back to ocr_text).
    // Log but don't fail the request.
  }

  // 7. Success ------------------------------------------------------------
  const body: NoteSuccessResponse = {
    document_id: documentId,
    status: "ocr_done",
  };
  return Response.json(body, { status: 200 });
}

/**
 * GET /api/documents/notes — method not allowed.
 */
export async function GET(): Promise<Response> {
  const body: UploadErrorResponse = {
    error: "Methode nicht erlaubt. Bitte POST verwenden.",
    code: "METHOD_NOT_ALLOWED",
  };
  return Response.json(body, { status: 405 });
}
