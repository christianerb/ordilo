import { Resend } from "resend";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs";
import {
  MAX_FILE_SIZE,
  detectMimeTypeFromBytes,
  validateFileWithSignature,
} from "@/lib/schemas/document";
import { buildStoragePath, sanitizeFilename } from "@/lib/api/storage";

const DAILY_UPLOAD_LIMIT = 50;

type InboundAttachment = {
  id: string;
  filename: string | null;
  content_type: string;
  download_url: string;
};

export type InboundImportResult = {
  importedDocumentIds: string[];
  skippedAttachments: number;
};

/**
 * Download supported attachments from a verified Resend inbound message and
 * store them through the same documents and OCR queue used for a scan.
 */
export async function importInboundEmailAttachments(params: {
  emailId: string;
  familyId: string;
  uploadedBy: string;
  notificationRecipient: string | null;
  resend: Resend;
}): Promise<InboundImportResult> {
  const { data: list, error } = await params.resend.emails.receiving.attachments.list({
    emailId: params.emailId,
  });
  if (error || !list) {
    throw new Error("Resend attachments could not be loaded.");
  }

  const attachments = list.data as InboundAttachment[];
  const admin = createAdminClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count, error: countError } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("family_id", params.familyId)
    .gte("created_at", todayStart.toISOString());

  if (countError) throw countError;

  const availableSlots = Math.max(0, DAILY_UPLOAD_LIMIT - (count ?? 0));
  let skippedAttachments = 0;
  const importedDocumentIds: string[] = [];

  for (const attachment of attachments) {
    if (importedDocumentIds.length >= availableSlots) {
      skippedAttachments += 1;
      continue;
    }

    const response = await fetch(attachment.download_url);
    if (!response.ok) throw new Error("Resend attachment could not be downloaded.");

    const bytes = new Uint8Array(await response.arrayBuffer());
    const claimedMimeType = attachment.content_type.split(";")[0].trim().toLowerCase();
    const mimeType = detectMimeTypeFromBytes(bytes) ?? claimedMimeType;
    const validation = validateFileWithSignature(mimeType, bytes.byteLength, bytes);
    if (!validation.valid || bytes.byteLength > MAX_FILE_SIZE) {
      skippedAttachments += 1;
      continue;
    }

    const documentId = crypto.randomUUID();
    const filename = attachment.filename?.trim() || "E-Mail-Anhang";
    const storagePath = buildStoragePath(
      params.familyId,
      documentId,
      sanitizeFilename(filename, "dokument"),
    );
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, new Blob([bytes], { type: mimeType }), {
        contentType: mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: document, error: insertError } = await admin
      .from("documents")
      .insert({
        id: documentId,
        family_id: params.familyId,
        uploaded_by: params.uploadedBy,
        status: "uploaded",
        file_url: storagePath,
        original_filename: filename,
        mime_type: mimeType,
        source: "email",
        source_email_id: params.emailId,
        source_attachment_id: attachment.id,
        source_email_recipient: params.notificationRecipient,
      })
      .select("id")
      .maybeSingle();

    if (insertError?.code === "23505") {
      await admin.storage.from("documents").remove([storagePath]);
      continue;
    }
    if (insertError || !document) {
      await admin.storage.from("documents").remove([storagePath]);
      throw insertError ?? new Error("Document insert returned no row.");
    }

    importedDocumentIds.push(document.id);
    await enqueueJob(admin, {
      family_id: params.familyId,
      document_id: document.id,
      job_type: "ocr",
    });
  }

  return { importedDocumentIds, skippedAttachments };
}
