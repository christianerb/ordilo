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

export type InboundAttachment = {
  id: string;
  filename: string | null;
  content_type: string;
  download_url: string;
};

export type InboundImportResult = {
  importedDocumentIds: string[];
  acceptedDocumentCount: number;
  skippedAttachments: number;
};

export function planInboundAttachmentImport(params: {
  attachments: readonly InboundAttachment[];
  existingAttachmentIds: ReadonlySet<string>;
  todayDocumentCount: number;
}) {
  const existingAttachmentCount = params.attachments.filter((attachment) =>
    params.existingAttachmentIds.has(attachment.id),
  ).length;
  // An earlier attempt may have stored an attachment from this very email.
  // It already occupies one row in today's count, but must not consume a
  // second slot when the webhook is retried.
  const availableSlots = Math.max(
    0,
    DAILY_UPLOAD_LIMIT -
      Math.max(0, params.todayDocumentCount - existingAttachmentCount),
  );
  const newAttachments = params.attachments.filter(
    (attachment) => !params.existingAttachmentIds.has(attachment.id),
  );
  return {
    attachmentsToImport: newAttachments.slice(0, availableSlots),
    existingAttachmentCount,
    quotaSkippedAttachments: Math.max(0, newAttachments.length - availableSlots),
  };
}

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
  const { data: existingDocuments, error: existingError } = await admin
    .from("documents")
    .select("source_attachment_id")
    .eq("source_email_id", params.emailId);
  if (existingError) throw existingError;

  const existingAttachmentIds = new Set(
    (existingDocuments ?? [])
      .map((document) => document.source_attachment_id)
      .filter((attachmentId): attachmentId is string => Boolean(attachmentId)),
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count, error: countError } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("family_id", params.familyId)
    .gte("created_at", todayStart.toISOString());

  if (countError) throw countError;

  const plan = planInboundAttachmentImport({
    attachments,
    existingAttachmentIds,
    todayDocumentCount: count ?? 0,
  });
  let skippedAttachments = plan.quotaSkippedAttachments;
  const importedDocumentIds: string[] = [];

  for (const attachment of plan.attachmentsToImport) {
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

    const jobQueued = await enqueueJob(admin, {
      family_id: params.familyId,
      document_id: document.id,
      job_type: "ocr",
    });
    if (!jobQueued) {
      // An inbound webhook has no client-side fallback to trigger OCR. Roll
      // the insert back so Resend can retry the complete attachment safely.
      await admin.from("documents").delete().eq("id", document.id);
      await admin.storage.from("documents").remove([storagePath]);
      throw new Error("Inbound OCR job could not be queued.");
    }
    importedDocumentIds.push(document.id);
  }

  return {
    importedDocumentIds,
    acceptedDocumentCount:
      plan.existingAttachmentCount + importedDocumentIds.length,
    skippedAttachments,
  };
}
