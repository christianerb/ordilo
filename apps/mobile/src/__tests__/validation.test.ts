import {
  validateLoginEmail,
  validateLoginPassword,
} from "../lib/validation";

describe("validateLoginEmail", () => {
  it("rejects empty input with the German message from the web app", () => {
    const result = validateLoginEmail("   ");
    expect(result).toEqual({
      success: false,
      error: "Bitte E-Mail-Adresse eingeben",
    });
  });

  it("rejects malformed addresses", () => {
    for (const email of ["foo", "foo@", "@bar.de", "foo bar@baz.de"]) {
      const result = validateLoginEmail(email);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Bitte gültige E-Mail-Adresse eingeben");
      }
    }
  });

  it("trims and lowercases valid addresses", () => {
    const result = validateLoginEmail("  Max@Beispiel.DE ");
    expect(result).toEqual({
      success: true,
      data: { email: "max@beispiel.de" },
    });
  });
});

describe("validateLoginPassword", () => {
  it("requires a password", () => {
    expect(validateLoginPassword("")).toEqual({
      success: false,
      error: "Bitte Passwort eingeben",
    });
  });

  it("preserves meaningful password whitespace", () => {
    expect(validateLoginPassword("  geheim  ")).toEqual({
      success: true,
      data: { password: "  geheim  " },
    });
  });
});
