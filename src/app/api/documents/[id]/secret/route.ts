import { requireUser } from "@/lib/auth/require-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { jsonError, methodNotAllowed } from "@/lib/api/respond";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

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

/** Mirrors the note route's cap on the plaintext length. */
const SECRET_MAX = 10_000;

/**
 * PUT /api/documents/[id]/secret — set, change or remove the hidden value.
 *
 * Until now a secret could only be set while creating a note, so a
 * password could never be corrected and a document created without one
 * (e.g. by the chat, which deliberately never carries a password) could
 * never get one. This endpoint closes that gap: it encrypts the plaintext
 * and stores only the envelope, exactly like the note route. An empty
 * string removes the secret.
 *
 * Auth: session client — RLS restricts the write to the user's family.
 */
export async function PUT(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const auth = await requireUser();
  if (auth.status) {
    return Response.json(auth.json, { status: auth.status });
  }

  const { id: documentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Ungültige Anfrage.", "INVALID_BODY", 400);
  }

  const raw = (body as { secret?: unknown })?.secret;
  if (typeof raw !== "string") {
    return jsonError("Kein Passwort angegeben.", "INVALID_BODY", 400);
  }
  if (raw.length > SECRET_MAX) {
    return jsonError(
      `Passwort ist zu lang (max. ${SECRET_MAX} Zeichen).`,
      "SECRET_TOO_LONG",
      400,
    );
  }

  // Whitespace decides only whether the field is empty; a secret that
  // deliberately starts or ends with a space must survive unchanged.
  const isRemoval = raw.trim().length === 0;

  let envelope: string | null = null;
  if (!isRemoval) {
    try {
      envelope = encryptSecret(raw);
    } catch {
      return jsonError(
        "Das Passwort konnte nicht verschlüsselt werden.",
        "SECRET_ENCRYPT_FAILED",
        500,
      );
    }
  }

  const serverClient = await createServerClient();
  const { data: updated, error } = await serverClient
    .from("documents")
    .update({ secret: envelope })
    .eq("id", documentId)
    .select("id")
    .maybeSingle();

  if (error) {
    return jsonError(
      "Passwort konnte nicht gespeichert werden.",
      "DB_WRITE_FAILED",
      500,
    );
  }
  if (!updated) {
    // No row visible through RLS → does not exist or belongs to another
    // family. Do not distinguish (no enumeration).
    return jsonError(
      "Dokument nicht gefunden oder kein Zugriff.",
      "DOCUMENT_NOT_FOUND",
      404,
    );
  }

  return Response.json({ has_secret: envelope !== null }, { status: 200 });
}

/**
 * GET /api/documents/[id]/secret — method not allowed. Reveal is a POST so
 * it is never triggered by a prefetch / GET-crawl.
 */
export async function GET(): Promise<Response> {
  return methodNotAllowed();
}
