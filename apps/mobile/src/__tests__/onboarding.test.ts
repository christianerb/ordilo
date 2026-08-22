import {
  AVATAR_COLORS,
  DEFAULT_COLLECTIONS,
  ROLE_CHIPS,
  validateFamilyName,
  validateMember,
} from "../lib/onboarding";

/**
 * Pins the mobile validation to the web Zod schemas
 * (src/lib/schemas/onboarding.ts) — same bounds, same German messages.
 */

describe("validateFamilyName", () => {
  it("rejects empty and whitespace-only names", () => {
    for (const name of ["", "   "]) {
      const result = validateFamilyName(name);
      expect(result).toEqual({
        success: false,
        error: "Bitte gib einen Familiennamen ein",
      });
    }
  });

  it("rejects names longer than 100 characters", () => {
    const result = validateFamilyName("a".repeat(101));
    expect(result).toEqual({
      success: false,
      error: "Der Familienname ist zu lang (maximal 100 Zeichen)",
    });
  });

  it("trims and accepts a valid name", () => {
    expect(validateFamilyName("  Familie Müller  ")).toEqual({
      success: true,
      data: { name: "Familie Müller" },
    });
  });
});

describe("validateMember", () => {
  it("rejects empty names", () => {
    expect(validateMember({ name: "  " })).toEqual({
      success: false,
      error: "Bitte einen Namen eingeben",
    });
  });

  it("rejects names over 100 and roles over 50 characters", () => {
    expect(validateMember({ name: "a".repeat(101) })).toEqual({
      success: false,
      error: "Der Name ist zu lang (maximal 100 Zeichen)",
    });
    expect(validateMember({ name: "Emma", role: "r".repeat(51) })).toEqual({
      success: false,
      error: "Die Rolle ist zu lang (maximal 50 Zeichen)",
    });
  });

  it("rejects malformed or implausible birthdates", () => {
    for (const birthdate of ["31.12.2010", "2010-13-01", "1899-05-01"]) {
      const result = validateMember({ name: "Emma", birthdate });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Bitte ein gültiges Geburtsdatum eingeben");
      }
    }
  });

  it("normalizes empty optional fields to null", () => {
    expect(
      validateMember({ name: "Emma", role: "", birthdate: "", avatar_color: "" }),
    ).toEqual({
      success: true,
      data: {
        name: "Emma",
        role: null,
        birthdate: null,
        avatar_color: null,
      },
    });
  });

  it("keeps provided optional fields", () => {
    expect(
      validateMember({
        name: "Emma",
        role: "Tochter",
        birthdate: "2018-03-05",
        avatar_color: "#E46018",
      }),
    ).toEqual({
      success: true,
      data: {
        name: "Emma",
        role: "Tochter",
        birthdate: "2018-03-05",
        avatar_color: "#E46018",
      },
    });
  });
});

describe("constants parity with the web app", () => {
  it("carries the same role chips", () => {
    expect([...ROLE_CHIPS]).toEqual([
      "Partner:in",
      "Kind",
      "Tochter",
      "Sohn",
      "Mutter",
      "Vater",
      "Oma",
      "Opa",
      "Bruder",
      "Schwester",
    ]);
  });

  it("carries the same default collections", () => {
    expect(DEFAULT_COLLECTIONS.map((c) => c.name)).toEqual([
      "Rechnungen",
      "Schule",
      "Verträge",
      "Gesundheit",
      "Unterlagen",
    ]);
  });

  it("carries the same avatar color presets", () => {
    expect([...AVATAR_COLORS]).toEqual([
      "#305460",
      "#E46018",
      "#8E44AD",
      "#27AE60",
      "#2980B9",
      "#F39C12",
      "#C0392B",
      "#16A085",
    ]);
  });
});
