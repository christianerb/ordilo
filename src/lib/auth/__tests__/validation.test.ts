import { describe, it, expect } from "vitest";
import { validateLoginEmail, loginEmailSchema } from "@/lib/auth/validation";

describe("loginEmailSchema", () => {
  it("rejects empty email with German message", () => {
    const result = loginEmailSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Bitte E-Mail-Adresse eingeben",
      );
    }
  });

  it("rejects whitespace-only email with German message", () => {
    const result = loginEmailSchema.safeParse({ email: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Bitte E-Mail-Adresse eingeben",
      );
    }
  });

  it("rejects malformed email formats with German message", () => {
    const invalid = ["not-an-email", "foo@", "@bar.de", "foo bar@example.com", "foo"];
    for (const email of invalid) {
      const result = loginEmailSchema.safeParse({ email });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Bitte gültige E-Mail-Adresse eingeben",
        );
      }
    }
  });

  it("accepts well-formed emails", () => {
    const valid = [
      "test+auth@ordilo.test",
      "user@example.com",
      "emma.kita@familie.de",
    ];
    for (const email of valid) {
      const result = loginEmailSchema.safeParse({ email });
      expect(result.success).toBe(true);
    }
  });
});

describe("validateLoginEmail", () => {
  it("returns success with a canonical email for valid input", () => {
    const result = validateLoginEmail("  Test@Ordilo.Test  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("test@ordilo.test");
    }
  });

  it("returns German error for empty input", () => {
    const result = validateLoginEmail("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte E-Mail-Adresse eingeben");
    }
  });

  it("returns German format error for invalid email", () => {
    const result = validateLoginEmail("foo@");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte gültige E-Mail-Adresse eingeben");
    }
  });
});
