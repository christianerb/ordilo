import type { UploadSuccessResponse, UploadErrorResponse } from "@/lib/schemas/document";

/**
 * Upload a file to the /api/documents/upload endpoint with progress tracking.
 *
 * Uses XMLHttpRequest (instead of fetch) because fetch does not support
 * upload progress events in most browsers. XHR's `upload.onprogress` gives
 * us real-time byte-level progress for the UI.
 *
 * @param file - The File to upload.
 * @param familyId - The family ID to associate the document with.
 * @param onProgress - Callback receiving the upload percentage (0-100).
 * @returns A promise resolving to { document_id, status } on success.
 * @throws An Error with a German message on failure (network error,
 *         server error, or validation rejection).
 */
export function uploadFile(
  file: File,
  familyId: string,
  onProgress?: (percent: number) => void,
): Promise<UploadSuccessResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("family_id", familyId);

    // Track upload progress.
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    // Handle completion.
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data: UploadSuccessResponse = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          reject(new Error("Upload fehlgeschlagen. Bitte erneut versuchen."));
        }
      } else {
        // Parse the structured error response.
        try {
          const error: UploadErrorResponse = JSON.parse(xhr.responseText);
          reject(new Error(error.error || "Upload fehlgeschlagen. Bitte erneut versuchen."));
        } catch {
          reject(new Error("Upload fehlgeschlagen. Bitte erneut versuchen."));
        }
      }
    });

    // Handle network-level errors (connection lost, CORS, etc.).
    xhr.addEventListener("error", () => {
      reject(new Error("Netzwerkfehler. Bitte Verbindung überprüfen und erneut versuchen."));
    });

    // Handle abort (if we add cancellation later).
    xhr.addEventListener("abort", () => {
      reject(new Error("Upload abgebrochen."));
    });

    // A stalled connection must surface as a retryable error instead of
    // leaving the wizard on "wird hochgeladen" forever.
    xhr.timeout = 120_000;
    xhr.addEventListener("timeout", () => {
      reject(
        new Error(
          "Der Upload dauert zu lange. Bitte Verbindung überprüfen und erneut versuchen.",
        ),
      );
    });

    xhr.open("POST", "/api/documents/upload");
    xhr.send(formData);
  });
}
