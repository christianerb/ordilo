import { describe, expect, it } from "vitest";
import { documentGuides } from "../document-guides";
import { getGuide, guides } from "../guides";

describe("document guide cluster", () => {
  it("registers every document guide with a unique slug", () => {
    const slugs = documentGuides.map((guide) => guide.slug);
    expect(documentGuides.length).toBeGreaterThanOrEqual(8);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(guides.map((guide) => guide.slug)).size).toBe(guides.length);
    for (const slug of slugs) expect(getGuide(slug)).toBeDefined();
  });

  it("only links to related guides that exist and never to itself", () => {
    const known = new Set(guides.map((guide) => guide.slug));
    for (const guide of documentGuides) {
      expect(guide.related.length).toBeGreaterThan(0);
      expect(guide.related).not.toContain(guide.slug);
      for (const related of guide.related) expect(known).toContain(related);
    }
  });

  it("keeps search snippets within length limits", () => {
    for (const guide of documentGuides) {
      expect(guide.title.length, guide.slug).toBeLessThanOrEqual(60);
      expect(guide.description.length, guide.slug).toBeGreaterThanOrEqual(120);
      expect(guide.description.length, guide.slug).toBeLessThanOrEqual(170);
    }
  });

  it("cites primary sources, marks examples as invented and disclaims advice", () => {
    for (const guide of documentGuides) {
      expect(guide.sources.length, guide.slug).toBeGreaterThanOrEqual(1);
      for (const source of guide.sources)
        expect(source.url, guide.slug).toMatch(/^https:\/\//);
      const text = guide.sections.map((section) => section.body).join("\n");
      expect(text, guide.slug).toContain("Erfundenes Beispiel");
      expect(text, guide.slug).toMatch(/keine Rechts(- oder Steuer)?beratung/);
      expect(text, guide.slug).toContain("Rechtsbehelfsbelehrung");
      expect(new Set(guide.sections.map((s) => s.id)).size).toBe(
        guide.sections.length,
      );
      expect(guide.updated).toBe("2026-10-22");
    }
  });

  it("links to statute sections with the gesetze-im-internet.de pattern", () => {
    const lawUrls = documentGuides
      .flatMap((guide) => guide.sources.map((source) => source.url))
      .filter((url) => url.includes("gesetze-im-internet.de"));
    expect(lawUrls.length).toBeGreaterThan(0);
    for (const url of lawUrls)
      expect(url).toMatch(
        /^https:\/\/www\.gesetze-im-internet\.de\/[a-z0-9_]+\/__\d+[a-z]?\.html$/,
      );
  });
});
