import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import { decryptSecret } from "@/lib/secrets";

/**
 * POST /api/documents/[id]/secret — reveal a document's hidden value.
 *
 * The document's `secret` column holds an AES-256-GCM envelope (ciphertext
 * only); the plaintext is never stored in the database. This endpoint is
 * the single place that decrypts and returns the plaintext, on explicit
 * user request (click-to-reveal). The encryption key lives in the server
 * environment, never in the DB.
 *
 * Auth: session client — RLS restricts the read to the user's family, so
 * only members of the owning family can reveal a secret.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  // 1. Authenticate ----------------------------------------------------------
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: documentId } = await params;

  // 2. Read the secret envelope (RLS-scoped) --------------------------------
  const serverClient = await createServerClient();
  const { data: document, error } = await serverClient
    .from("documents")
    .select("secret")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    return jsonError("Dokument konnte nicht geladen werden.", "DB_READ_FAILED", 500);
  }
  if (!document) {
    // Not found via RLS → either does not exist or not owned by the user's
    // family. Do not distinguish (no enumeration).
    return jsonError(
      "Dokument nicht gefunden oder kein Zugriff.",
      "DOCUMENT_NOT_FOUND",
      404,
    );
  }

  // 3. Decrypt --------------------------------------------------------------
  if (!document.secret) {
    return jsonError(
      "Dieses Dokument hat kein hinterlegtes Geheim.",
      "NO_SECRET",
      404,
    );
  }

  try {
    const plaintext = decryptSecret(document.secret);
    return Response.json({ secret: plaintext ?? "" }, { status: 200 });
  } catch {
    return jsonError(
      "Das Geheim konnte nicht entschlüsselt werden.",
      "SECRET_DECRYPT_FAILED",
      500,
    );
  }
}

/**
 * GET /api/documents/[id]/secret — method not allowed. Reveal is a POST so
 * it is never triggered by a prefetch / GET-crawl.
 */
export async function GET(): Promise<Response> {
  return methodNotAllowed();
}
