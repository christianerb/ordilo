import { describe, it, expect } from "vitest";
import { redactPII, redactSecretsForStorage } from "@/lib/ai/pii-redact";

describe("redactPII", () => {
  it("redacts IBANs", () => {
    const text = "Meine IBAN ist DE89 3704 0044 0532 0130 00.";
    const result = redactPII(text);
    expect(result).toContain("[IBAN]");
    expect(result).not.toContain("DE89 3704 0044 0532 0130 00");
  });

  it("redacts IBANs without spaces", () => {
    const text = "IBAN: DE89370400440532013000";
    const result = redactPII(text);
    expect(result).toContain("[IBAN]");
    expect(result).not.toContain("DE89370400440532013000");
  });

  it("redacts German tax IDs (dotted format)", () => {
    const text = "Steuer-ID: 12.345.678.901";
    const result = redactPII(text);
    expect(result).toContain("[Steuer-ID]");
    expect(result).not.toContain("12.345.678.901");
  });

  it("redacts German tax IDs (continuous format)", () => {
    const text = "Steuer-ID: 12345678901";
    const result = redactPII(text);
    expect(result).toContain("[Steuer-ID]");
  });

  it("redacts health insurance numbers", () => {
    const text = "Versichertennummer: A123456789";
    const result = redactPII(text);
    expect(result).toContain("[Versicherungsnummer]");
    expect(result).not.toContain("A123456789");
  });

  it("does not redact normal text", () => {
    const text = "Der Kita-Brief vom 15. Juli 2026 enthält Informationen zum Sommerfest.";
    const result = redactPII(text);
    expect(result).toBe(text);
  });

  it("redacts multiple patterns in one text", () => {
    const text = "IBAN: DE89 3704 0044 0532 0130 00, Steuer-ID: 12.345.678.901";
    const result = redactPII(text);
    expect(result).toContain("[IBAN]");
    expect(result).toContain("[Steuer-ID]");
  });

  it("leaves short numbers intact (not tax IDs)", () => {
    const text = "Rechnungsbetrag: 123,45 Euro";
    const result = redactPII(text);
    expect(result).toBe(text);
  });
});

describe("redactSecretsForStorage", () => {
  it("masks a password handed over with a marker", () => {
    const result = redactSecretsForStorage(
      "Leg die Zugangsdaten für Netflix an, das Passwort ist hunter2",
    );
    expect(result).toBe(
      "Leg die Zugangsdaten für Netflix an, das Passwort ist [Passwort]",
    );
    expect(result).not.toContain("hunter2");
  });

  it("masks the colon, equals and 'lautet' forms", () => {
    expect(redactSecretsForStorage("Passwort: geheim123")).toBe(
      "Passwort: [Passwort]",
    );
    expect(redactSecretsForStorage("PIN = 4711")).toBe("PIN = [Passwort]");
    expect(redactSecretsForStorage("Kennwort lautet Sommer2026!")).toBe(
      "Kennwort lautet [Passwort]",
    );
  });

  it("masks a dictated password without a marker", () => {
    expect(redactSecretsForStorage("Passwort hunter2 für den Router")).toBe(
      "Passwort [Passwort] für den Router",
    );
  });

  it("leaves a question about a password readable", () => {
    // No marker and no secret-shaped token — the sentence must survive,
    // otherwise the history becomes unreadable.
    const question = "Was ist das Passwort für Netflix?";
    expect(redactSecretsForStorage(question)).toBe(question);
  });

  it("leaves ordinary prose about passwords alone", () => {
    const text =
      "Das Passwort kannst du im Dokument hinterlegen, es wird verschlüsselt gespeichert.";
    expect(redactSecretsForStorage(text)).toBe(text);
  });

  it("strips the quotes around a quoted password", () => {
    expect(redactSecretsForStorage('Passwort ist "hunter2"')).toBe(
      "Passwort ist [Passwort]",
    );
  });

  it("masks several passwords in one message", () => {
    const result = redactSecretsForStorage(
      "Netflix Passwort: abc123, WLAN Kennwort ist xyz789",
    );
    expect(result).not.toContain("abc123");
    expect(result).not.toContain("xyz789");
  });

  it("leaves a message without any password untouched", () => {
    const text = "Wann ist der Zahnarzttermin von Emma?";
    expect(redactSecretsForStorage(text)).toBe(text);
  });
});
