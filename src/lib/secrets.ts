import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encrypted secret storage for documents.
 *
 * A document may carry a single hidden value (typically a password) in
 * `documents.secret`. The plaintext is NEVER persisted — not in `secret`,
 * not in `ocr_text`, not anywhere in the database. Only an AES-256-GCM
 * envelope (IV + ciphertext + auth tag) is stored, base64-encoded and
 * colon-separated: `<iv>:<ciphertext+tag>`.
 *
 * The encryption key lives in the server environment as
 * `SECRETS_ENCRYPTION_KEY` (32 bytes, base64- or hex-encoded). It is never
 * read from or written to the database, so a DB dump reveals only
 * ciphertext. Only the reveal API (`/api/documents/[id]/secret`) decrypts
 * and returns the plaintext, on explicit user request.
 *
 * Server-only module. Never import this from client code — the key must
 * not reach the browser.
 */

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce length

let cachedKey: Buffer | null = null;

/**
 * Load and validate the encryption key from the environment.
 * Accepts base64 or hex encoding of 32 bytes.
 *
 * @throws if the key is missing or the wrong length.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY ist nicht konfiguriert. Bitte als 32-Byte-Wert (base64 oder hex) in den Server-Umgebungsvariablen setzen.",
    );
  }

  // Try base64 first, then hex. Validate the decoded length.
  let key: Buffer | undefined;
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === KEY_BYTES) key = b64;
  } catch {
    // Not valid base64 — fall through to hex.
  }
  if (!key) {
    try {
      const hex = Buffer.from(raw, "hex");
      if (hex.length === KEY_BYTES) key = hex;
    } catch {
      // Not valid hex either.
    }
  }

  if (!key) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY muss 32 Byte (base64 oder hex) sein, hat aber keinen gültigen Wert.`,
    );
  }

  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext secret into the storage envelope format.
 *
 * @returns `<iv-base64>:<ciphertext+tag-base64>`, or null for empty input.
 */
export function encryptSecret(plaintext: string): string | null {
  if (!plaintext) return null;
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([ct, tag]);
  return `${iv.toString("base64")}:${envelope.toString("base64")}`;
}

/**
 * Decrypt a storage envelope back to plaintext.
 *
 * @returns the plaintext, or null if the input is empty.
 * @throws if the envelope is malformed or authentication fails (tampering).
 */
export function decryptSecret(envelope: string | null): string | null {
  if (!envelope) return null;
  const key = getKey();
  const sep = envelope.indexOf(":");
  if (sep <= 0 || sep === envelope.length - 1) {
    throw new Error("Ungültiges Secret-Format.");
  }
  const iv = Buffer.from(envelope.slice(0, sep), "base64");
  const data = Buffer.from(envelope.slice(sep + 1), "base64");
  if (iv.length !== IV_BYTES || data.length < 16) {
    throw new Error("Ungültiges Secret-Format.");
  }
  const tag = data.subarray(data.length - 16);
  const ct = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
