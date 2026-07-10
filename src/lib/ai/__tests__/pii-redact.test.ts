import { describe, it, expect } from "vitest";
import { redactPII } from "@/lib/ai/pii-redact";

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
