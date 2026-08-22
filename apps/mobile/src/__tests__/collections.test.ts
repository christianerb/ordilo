import {
  COLLECTION_COLOR_OPTIONS,
  COLLECTION_ICON_OPTIONS,
  categoriesMatch,
  collectionInputSchema,
  countDocumentsPerCollection,
  fetchAllRows,
  getCollectionColor,
  validateCollectionInput,
} from "../lib/collections";

describe("categoriesMatch (port of the web predicate)", () => {
  it("matches case, whitespace, plural and umlaut variants", () => {
    expect(categoriesMatch("rechnungen", "Rechnungen")).toBe(true);
    expect(categoriesMatch("Rechnung", "Rechnungen")).toBe(true);
    expect(categoriesMatch("Verträge", "Vertrag")).toBe(true);
    expect(categoriesMatch("  Kita   Briefe ", "Kita Briefe")).toBe(true);
  });

  it("does not fold short words or different words", () => {
    // "Kfz" must not be stemmed into something else.
    expect(categoriesMatch("Kfz", "Kita")).toBe(false);
    expect(categoriesMatch("Steuer", "Rechnungen")).toBe(false);
  });
});

describe("fetchAllRows", () => {
  it("pages until a short page arrives and keeps the order", async () => {
    const rows = Array.from({ length: 2_500 }, (_, index) => index);
    const requested: [number, number][] = [];
    const result = await fetchAllRows(async (from, to) => {
      requested.push([from, to]);
      return rows.slice(from, to + 1);
    });
    expect(result).toEqual(rows);
    expect(requested).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("returns a single short page without extra requests", async () => {
    let calls = 0;
    const result = await fetchAllRows(async () => {
      calls += 1;
      return [1, 2];
    });
    expect(result).toEqual([1, 2]);
    expect(calls).toBe(1);
  });

  it("keeps paging when a page is exactly full", async () => {
    const result = await fetchAllRows(
      async (from) => (from === 0 ? [1, 2, 3] : []),
      3,
    );
    expect(result).toEqual([1, 2, 3]);
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

  it("counts canonical singular/plural and umlaut variants (web parity)", () => {
    const counts = countDocumentsPerCollection(
      [
        { id: "c1", name: "Rechnungen" },
        { id: "c3", name: "Vertrag" },
      ],
      ["Rechnung", "rechnung", "Verträge"],
    );
    expect(counts.get("c1")).toBe(2);
    expect(counts.get("c3")).toBe(1);
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
