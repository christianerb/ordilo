import type { Database } from "@/types/database";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

/**
 * Shared helpers for document API routes.
 *
 * These utilities eliminate duplication across the analyze, confirm, and
 * OCR route handlers for:
 *   - UUID validation
 *   - Marking a document as failed (best-effort status update)
 *   - Resolving a document with RLS + ownership distinction (403 vs 404)
 */

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

/** Error response shape shared by all document API routes. */
export type DocumentErrorResponse = { error: string; code: string };

/** Discriminated result of {@link resolveDocumentWithOwnership}. */
export type ResolveResult<T = DocumentRow> =
  | { document: T; error: null }
  | { document: null; error: { status: number; body: DocumentErrorResponse } };

/**
 * Regex matching a canonical UUID (case-insensitive).
 *
 * Exported so route handlers can reuse the constant directly if needed.
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns `true` when `id` is a valid UUID string.
 */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Mark a document as failed with an error message.
 *
 * Best-effort: errors are silently ignored so we don't mask the primary
 * error with a secondary DB error.
 *
 * @param clearConfirmedAt When `true`, also sets `confirmed_at` to `null`.
 *   Used by the confirm route so a failed confirm (which the RPC may have
 *   set during the conditional transition before rolling back) does not
 *   leave a stale `confirmed_at` value on a failed document.
 */
export async function markDocumentFailed(
  client: ServerClient,
  documentId: string,
  errorMessage: string,
  clearConfirmedAt = false,
): Promise<void> {
  try {
    await client
      .from("documents")
      .update({
        status: "failed",
        error_message: errorMessage,
        ...(clearConfirmedAt ? { confirmed_at: null } : {}),
      })
      .eq("id", documentId);
  } catch {
    // Best-effort: if we can't update the status, the document stays in
    // its current state. This is a degraded state but preferable to
    // crashing the route handler.
  }
}

/**
 * Resolve a document with RLS-scoped access and ownership distinction.
 *
 * Flow:
 *   1. Validate the document ID is a UUID → 400 if invalid.
 *   2. Read the document (RLS-scoped) via the server client.
 *      - On DB error → 500.
 *   3. If no row is returned (non-existent OR RLS-blocked), use the admin
 *      (service-role) client to check existence:
 *        - Document exists but belongs to another family → 403.
 *        - Document truly does not exist → 404.
 *
 * The German error messages and codes match those previously inlined in
 * the analyze and confirm route handlers.
 *
 * @param serverClient RLS-scoped server client (reads as the authenticated user).
 * @param adminClient Service-role admin client (bypasses RLS for existence check).
 * @param documentId The document ID from the route params.
 */
export async function resolveDocumentWithOwnership(
  serverClient: ServerClient,
  adminClient: AdminClient,
  documentId: string,
): Promise<ResolveResult<DocumentRow>> {
  // 1. UUID validation -----------------------------------------------------
  if (!isValidUuid(documentId)) {
    return {
      document: null,
      error: {
        status: 400,
        body: {
          error: "Ungültige Dokument-ID.",
          code: "INVALID_DOCUMENT_ID",
        },
      },
    };
  }

  // 2. RLS-scoped read -----------------------------------------------------
  const { data: document, error: readError } = await serverClient
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (readError) {
    return {
      document: null,
      error: {
        status: 500,
        body: {
          error: "Dokument konnte nicht geladen werden.",
          code: "DB_READ_FAILED",
        },
      },
    };
  }

  // 3. Not found (or RLS blocked) → distinguish 403 vs 404 -----------------
  if (!document) {
    const { data: existingDoc } = await adminClient
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();

    if (existingDoc) {
      // Document exists but belongs to another family → 403
      return {
        document: null,
        error: {
          status: 403,
          body: {
            error: "Kein Zugriff auf dieses Dokument.",
            code: "FORBIDDEN",
          },
        },
      };
    }

    // Document truly does not exist → 404
    return {
      document: null,
      error: {
        status: 404,
        body: {
          error: "Dokument nicht gefunden.",
          code: "DOCUMENT_NOT_FOUND",
        },
      },
    };
  }

  return { document, error: null };
}
