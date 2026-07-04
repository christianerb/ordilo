import { describe, it, expect } from "vitest";
import {
  familyNameSchema,
  memberSchema,
  validateFamilyName,
  validateMember,
  AVATAR_COLORS,
} from "@/lib/schemas/onboarding";

// ---------------------------------------------------------------------------
// familyNameSchema
// ---------------------------------------------------------------------------

describe("familyNameSchema", () => {
  it("rejects empty family name with German message", () => {
    const result = familyNameSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Bitte gib einen Familiennamen ein",
      );
    }
  });

  it("rejects whitespace-only family name with German message", () => {
    const result = familyNameSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Bitte gib einen Familiennamen ein",
      );
    }
  });

  it("rejects family name longer than 100 characters", () => {
    const result = familyNameSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts a valid family name and trims it", () => {
    const result = familyNameSchema.safeParse({ name: "  Familie Müller  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Familie Müller");
    }
  });
});

// ---------------------------------------------------------------------------
// validateFamilyName
// ---------------------------------------------------------------------------

describe("validateFamilyName", () => {
  it("returns success with trimmed name for valid input", () => {
    const result = validateFamilyName("  Familie Schmidt  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Familie Schmidt");
    }
  });

  it("returns German error for empty input", () => {
    const result = validateFamilyName("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte gib einen Familiennamen ein");
    }
  });

  it("returns German error for whitespace-only input", () => {
    const result = validateFamilyName("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte gib einen Familiennamen ein");
    }
  });
});

// ---------------------------------------------------------------------------
// memberSchema
// ---------------------------------------------------------------------------

describe("memberSchema", () => {
  it("rejects empty member name with German message", () => {
    const result = memberSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Bitte einen Namen eingeben");
    }
  });

  it("rejects whitespace-only member name with German message", () => {
    const result = memberSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Bitte einen Namen eingeben");
    }
  });

  it("accepts a member with only a name (optional fields omitted)", () => {
    const result = memberSchema.safeParse({ name: "Emma" });
    expect(result.success).toBe(true);
  });

  it("accepts a member with all optional fields provided", () => {
    const result = memberSchema.safeParse({
      name: "Emma",
      role: "Kind",
      birthdate: "2018-03-12",
      avatar_color: "#305460",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty strings for optional fields", () => {
    const result = memberSchema.safeParse({
      name: "Emma",
      role: "",
      birthdate: "",
      avatar_color: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid birthdate format", () => {
    const result = memberSchema.safeParse({
      name: "Emma",
      birthdate: "not-a-date",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Bitte ein gültiges Geburtsdatum eingeben",
      );
    }
  });

  it("rejects birthdate before 1900", () => {
    const result = memberSchema.safeParse({
      name: "Emma",
      birthdate: "1899-01-01",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateMember
// ---------------------------------------------------------------------------

describe("validateMember", () => {
  it("returns success with normalized data for name-only input", () => {
    const result = validateMember({ name: "Emma" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Emma");
      expect(result.data.role).toBeNull();
      expect(result.data.birthdate).toBeNull();
      expect(result.data.avatar_color).toBeNull();
    }
  });

  it("returns success with all optional fields populated", () => {
    const result = validateMember({
      name: "Vater Thomas",
      role: "Vater",
      birthdate: "1985-06-15",
      avatar_color: "#E46018",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Vater Thomas");
      expect(result.data.role).toBe("Vater");
      expect(result.data.birthdate).toBe("1985-06-15");
      expect(result.data.avatar_color).toBe("#E46018");
    }
  });

  it("converts empty optional fields to null", () => {
    const result = validateMember({
      name: "Emma",
      role: "",
      birthdate: "",
      avatar_color: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBeNull();
      expect(result.data.birthdate).toBeNull();
      expect(result.data.avatar_color).toBeNull();
    }
  });

  it("returns German error for empty name", () => {
    const result = validateMember({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte einen Namen eingeben");
    }
  });

  it("trims the name", () => {
    const result = validateMember({ name: "  Emma  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Emma");
    }
  });
});

// ---------------------------------------------------------------------------
// AVATAR_COLORS
// ---------------------------------------------------------------------------

describe("AVATAR_COLORS", () => {
  it("provides a non-empty array of hex colors", () => {
    expect(AVATAR_COLORS.length).toBeGreaterThan(0);
    for (const color of AVATAR_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
