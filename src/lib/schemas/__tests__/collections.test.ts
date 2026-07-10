import { describe, it, expect } from "vitest";
import {
  COLLECTION_ICON_OPTIONS,
  COLLECTION_COLOR_OPTIONS,
  DEFAULT_COLLECTIONS,
  getCollectionIcon,
  getCollectionColor,
  validateCollectionInput,
} from "@/lib/schemas/collections";

describe("getCollectionIcon", () => {
  it("resolves a known icon key", () => {
    const icon = getCollectionIcon("heart");
    expect(icon).toBe(
      COLLECTION_ICON_OPTIONS.find((o) => o.key === "heart")!.icon,
    );
  });

  it("falls back to the default icon for an unknown key", () => {
    const icon = getCollectionIcon("does-not-exist");
    expect(icon).toBe(
      COLLECTION_ICON_OPTIONS.find((o) => o.key === "file-text")!.icon,
    );
  });

  it("falls back to the default icon for null/undefined", () => {
    expect(getCollectionIcon(null)).toBe(
      COLLECTION_ICON_OPTIONS.find((o) => o.key === "file-text")!.icon,
    );
    expect(getCollectionIcon(undefined)).toBe(
      COLLECTION_ICON_OPTIONS.find((o) => o.key === "file-text")!.icon,
    );
  });
});

describe("getCollectionColor", () => {
  it("resolves a known color key", () => {
    const color = getCollectionColor("apricot");
    expect(color.key).toBe("apricot");
  });

  it("falls back to petrol for an unknown key", () => {
    const color = getCollectionColor("does-not-exist");
    expect(color.key).toBe("petrol");
  });

  it("falls back to petrol for null/undefined", () => {
    expect(getCollectionColor(null).key).toBe("petrol");
    expect(getCollectionColor(undefined).key).toBe("petrol");
  });
});

describe("validateCollectionInput", () => {
  it("accepts a valid input and trims the name", () => {
    const result = validateCollectionInput({
      name: "  Versicherungen  ",
      icon: "shield",
      color: "petrol",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Versicherungen");
    }
  });

  it("rejects an empty name with a German error", () => {
    const result = validateCollectionInput({
      name: "",
      icon: "shield",
      color: "petrol",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Bitte gib einen Namen ein");
    }
  });

  it("rejects a name longer than 50 characters", () => {
    const result = validateCollectionInput({
      name: "a".repeat(51),
      icon: "shield",
      color: "petrol",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown icon key", () => {
    const result = validateCollectionInput({
      name: "Test",
      icon: "not-a-real-icon",
      color: "petrol",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown color key", () => {
    const result = validateCollectionInput({
      name: "Test",
      icon: "shield",
      color: "not-a-real-color",
    });
    expect(result.success).toBe(false);
  });
});

describe("DEFAULT_COLLECTIONS", () => {
  it("has exactly 5 default collections matching the reference design", () => {
    expect(DEFAULT_COLLECTIONS).toHaveLength(5);
    expect(DEFAULT_COLLECTIONS.map((c) => c.name)).toEqual([
      "Rechnungen",
      "Schule",
      "Verträge",
      "Gesundheit",
      "Unterlagen",
    ]);
  });

  it("every default collection uses a valid icon and color key", () => {
    const iconKeys = new Set(COLLECTION_ICON_OPTIONS.map((o) => o.key));
    const colorKeys = new Set(COLLECTION_COLOR_OPTIONS.map((o) => o.key));
    for (const c of DEFAULT_COLLECTIONS) {
      expect(iconKeys.has(c.icon)).toBe(true);
      expect(colorKeys.has(c.color)).toBe(true);
    }
  });
});
