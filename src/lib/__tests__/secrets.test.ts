import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/secrets";

// ---------------------------------------------------------------------------
// AES-256-GCM secret encryption helpers.
//
// The key lives in the server environment (SECRETS_ENCRYPTION_KEY). These
// tests verify the round-trip, tamper detection, format, and key-handling
// behavior — without depending on a real key.
// ---------------------------------------------------------------------------

/** 32-byte test key as base64. */
const TEST_KEY_B64 = Buffer.alloc(32, 0x42).toString("base64");
/** 32-byte test key as hex. */
const TEST_KEY_HEX = Buffer.alloc(32, 0x42).toString("hex");

describe("secrets (AES-256-GCM)", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    // The module caches the key; reset between tests.
    vi.resetModules();
    process.env.SECRETS_ENCRYPTION_KEY = TEST_KEY_B64;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  it("round-trips a plaintext secret", () => {
    const envelope = encryptSecret("mein-geheimes-passwort")!;
    expect(envelope).not.toBeNull();
    expect(envelope).not.toContain("mein-geheimes-passwort");
    expect(decryptSecret(envelope)).toBe("mein-geheimes-passwort");
  });

  it("produces a colon-separated iv:ciphertext envelope", () => {
    const envelope = encryptSecret("secret")!;
    expect(envelope).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  });

  it("uses a fresh IV per encryption (non-deterministic)", () => {
    const a = encryptSecret("same")!;
    const b = encryptSecret("same")!;
    expect(a).not.toEqual(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("returns null for empty input", () => {
    expect(encryptSecret("")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it("detects tampering (auth tag failure)", () => {
    const envelope = encryptSecret("original")!;
    // Flip a character in the ciphertext portion.
    const tampered = envelope.slice(0, -1) + (envelope.endsWith("=") ? "A" : "=");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("accepts a hex-encoded key", async () => {
    vi.resetModules();
    process.env.SECRETS_ENCRYPTION_KEY = TEST_KEY_HEX;
    const { encryptSecret: enc, decryptSecret: dec } = await import("@/lib/secrets");
    const envelope = enc("hex-secret")!;
    expect(dec(envelope)).toBe("hex-secret");
  });

  it("throws on a missing key", async () => {
    vi.resetModules();
    delete process.env.SECRETS_ENCRYPTION_KEY;
    const { encryptSecret: enc } = await import("@/lib/secrets");
    expect(() => enc("no-key")).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });

  it("throws on a wrong-length key", async () => {
    vi.resetModules();
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(16, 0x42).toString("base64");
    const { encryptSecret: enc } = await import("@/lib/secrets");
    expect(() => enc("bad-key")).toThrow(/32 Byte/);
  });

  it("throws on a malformed envelope", () => {
    expect(() => decryptSecret("not-an-envelope")).toThrow();
    expect(() => decryptSecret("abcd")).toThrow();
  });
});
