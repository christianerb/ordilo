import { describe, it, expect } from "vitest";
import {
  repairPartialJson,
  extractPartialPreview,
  previewFieldCount,
} from "@/lib/ai/partial-json";

describe("repairPartialJson", () => {
  it("parses already-complete JSON directly", () => {
    expect(repairPartialJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("closes a truncated object", () => {
    expect(repairPartialJson('{"title":"Ki')).toEqual({ title: "Ki" });
  });

  it("closes a truncated nested array of objects", () => {
    const result = repairPartialJson(
      '{"title":"Brief","dates":[{"date":"2026-01-01","label":"Frist"},{"date":"2026-02',
    );
    expect(result).toEqual({
      title: "Brief",
      dates: [
        { date: "2026-01-01", label: "Frist" },
        { date: "2026-02" },
      ],
    });
  });

  it("drops a dangling trailing comma before closing", () => {
    expect(repairPartialJson('{"tags":["a","b",')).toEqual({
      tags: ["a", "b"],
    });
  });

  it("drops a dangling trailing colon with no value", () => {
    expect(repairPartialJson('{"title":')).toEqual({ title: null });
  });

  it("returns null for unrepairable garbage", () => {
    expect(repairPartialJson("not json at all }}}[[[")).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(repairPartialJson("")).toBeNull();
    expect(repairPartialJson("   ")).toBeNull();
  });
});

describe("extractPartialPreview", () => {
  it("returns an empty object for non-object input", () => {
    expect(extractPartialPreview(null)).toEqual({});
    expect(extractPartialPreview("string")).toEqual({});
    expect(extractPartialPreview(42)).toEqual({});
  });

  it("picks up a title once present", () => {
    expect(extractPartialPreview({ title: "Kita-Brief" })).toEqual({
      title: "Kita-Brief",
    });
  });

  it("ignores an empty/whitespace-only title", () => {
    expect(extractPartialPreview({ title: "   " })).toEqual({});
  });

  it("only includes dates with both date and label present", () => {
    const preview = extractPartialPreview({
      dates: [
        { date: "2026-01-01", label: "Frist" },
        { date: "2026-02-01" }, // incomplete tail item, still streaming
      ],
    });
    expect(preview.dates).toEqual([{ date: "2026-01-01", label: "Frist" }]);
  });

  it("only includes tasks/persons with non-empty names", () => {
    const preview = extractPartialPreview({
      family_members: [{ name: "Anna" }, { name: "" }, { name: "  " }],
      tasks: [{ title: "Formular abgeben" }, {}],
    });
    expect(preview.family_members).toEqual([{ name: "Anna" }]);
    expect(preview.tasks).toEqual([{ title: "Formular abgeben" }]);
  });

  it("combines multiple recognized fields", () => {
    const preview = extractPartialPreview({
      title: "Kita-Brief",
      suggested_category: "Kita",
      family_members: [{ name: "Anna" }],
      extra_unknown_field: "ignored",
    });
    expect(preview).toEqual({
      title: "Kita-Brief",
      suggested_category: "Kita",
      family_members: [{ name: "Anna" }],
    });
  });
});

describe("previewFieldCount", () => {
  it("counts top-level preview fields", () => {
    expect(previewFieldCount({})).toBe(0);
    expect(previewFieldCount({ title: "x" })).toBe(1);
    expect(
      previewFieldCount({ title: "x", suggested_category: "y" }),
    ).toBe(2);
  });
});
