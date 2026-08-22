import {
  COLLECTION_COLOR_OPTIONS,
  COLLECTION_ICON_OPTIONS,
  collectionInputSchema,
  countDocumentsPerCollection,
  escapeIlikePattern,
  getCollectionColor,
  validateCollectionInput,
} from "../lib/collections";

describe("escapeIlikePattern", () => {
  it("escapes PostgREST wildcards so names match literally", () => {
    expect(escapeIlikePattern("50 % Teilzeit")).toBe("50 \\% Teilzeit");
    expect(escapeIlikePattern("Auto_1")).toBe("Auto\\_1");
    expect(escapeIlikePattern("Rechnungen")).toBe("Rechnungen");
    expect(escapeIlikePattern("C:\\Dokumente")).toBe("C:\\\\Dokumente");
  });
});

describe("collection validation", () => {
  it("trims the name and accepts a valid icon/color pair", () => {
    const result = validateCollectionInput({
      name: "  Rechnungen  ",
      icon: "receipt",
      color: "petrol",
    });
    expect(result).toEqual({
      success: true,
      data: { name: "Rechnungen", icon: "receipt", color: "petrol" },
    });
  });

  it("rejects empty and overlong names with German messages", () => {
    expect(
      validateCollectionInput({ name: "   ", icon: "receipt", color: "petrol" }),
    ).toEqual({ success: false, error: "Bitte gib einen Namen ein" });

    expect(
      validateCollectionInput({
        name: "a".repeat(51),
        icon: "receipt",
        color: "petrol",
      }),
    ).toEqual({
      success: false,
      error: "Der Name ist zu lang (maximal 50 Zeichen)",
    });
  });

  it("rejects unknown icon and color keys", () => {
    expect(
      validateCollectionInput({ name: "Schule", icon: "rocket", color: "petrol" }),
    ).toEqual({ success: false, error: "Ungültiges Icon" });

    expect(
      validateCollectionInput({ name: "Schule", icon: "heart", color: "neon" }),
    ).toEqual({ success: false, error: "Ungültige Farbe" });
  });

  it("stays aligned with the web schema option keys", () => {
    // Web reference: src/lib/schemas/collections.ts — same keys, same order.
    expect(COLLECTION_ICON_OPTIONS.map((opt) => opt.key)).toEqual([
      "file-text",
      "receipt",
      "building",
      "shield",
      "heart",
      "graduation-cap",
      "car",
      "home",
      "briefcase",
      "wallet",
    ]);
    expect(COLLECTION_COLOR_OPTIONS.map((opt) => opt.key)).toEqual([
      "petrol",
      "apricot",
      "destructive",
      "blue-soft",
      "mist",
      "apricot-light",
    ]);
    // Every option key must round-trip through its own validation.
    for (const icon of COLLECTION_ICON_OPTIONS) {
      expect(
        collectionInputSchema.safeParse({
          name: "Test",
          icon: icon.key,
          color: "petrol",
        }).success,
      ).toBe(true);
    }
    for (const color of COLLECTION_COLOR_OPTIONS) {
      expect(
        collectionInputSchema.safeParse({
          name: "Test",
          icon: "file-text",
          color: color.key,
        }).success,
      ).toBe(true);
    }
  });
});

describe("collection color fallbacks", () => {
  it("falls back to petrol for unknown color keys", () => {
    expect(getCollectionColor("neon")).toEqual(getCollectionColor("petrol"));
    expect(getCollectionColor(undefined)).toEqual(getCollectionColor("petrol"));
  });
});

describe("countDocumentsPerCollection", () => {
  const collections = [
    { id: "c1", name: "Rechnungen" },
    { id: "c2", name: "Schule" },
  ];

  it("counts documents case-insensitively per collection", () => {
    const counts = countDocumentsPerCollection(collections, [
      "Rechnungen",
      "rechnungen",
      "RECHNUNGEN",
      "Schule",
      null,
    ]);
    expect(counts.get("c1")).toBe(3);
    expect(counts.get("c2")).toBe(1);
  });

  it("ignores categories without a matching collection and vice versa", () => {
    const counts = countDocumentsPerCollection(collections, [
      "Sonstiges",
      null,
      "",
    ]);
    expect(counts.size).toBe(0);
    expect(counts.get("c1")).toBeUndefined();
  });
});
