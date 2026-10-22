import { describe, expect, it } from "vitest";
import { comparisonGuides } from "../comparison-guides";
import { getGuide, guides } from "../guides";

const fullText = (slug: string) => {
  const guide = getGuide(slug)!;
  return [
    guide.answer,
    ...guide.sections.map((section) => section.body),
    ...guide.sources.map((source) => source.note),
  ].join("\n");
};

describe("comparison guides", () => {
  it("are registered once with unique slugs, sections and sources", () => {
    expect(comparisonGuides.map((guide) => guide.slug)).toEqual([
      "dokumenten-app-familie-vergleich",
      "ordilo-oder-chatgpt-dokumente",
    ]);
    for (const guide of comparisonGuides) {
      expect(guides.filter((entry) => entry.slug === guide.slug)).toHaveLength(
        1,
      );
      expect(guide.updated).toBe("2026-10-22");
      expect(new Set(guide.sections.map((s) => s.id)).size).toBe(
        guide.sections.length,
      );
      expect(new Set(guide.sources.map((s) => s.url)).size).toBe(
        guide.sources.length,
      );
      expect(guide.description.length).toBeLessThanOrEqual(170);
    }
  });

  it("only links related articles and internal guide links that exist", () => {
    const slugs = new Set(guides.map((guide) => guide.slug));
    for (const guide of comparisonGuides) {
      for (const related of guide.related) expect(slugs).toContain(related);
      for (const section of guide.sections) {
        for (const [, slug] of section.body.matchAll(
          /\]\(\/ratgeber\/([a-z0-9-]+)/g,
        ))
          expect(slugs).toContain(slug);
      }
    }
  });

  it("states pricing and AI processing consistently with the privacy policy", () => {
    const family = fullText("dokumenten-app-familie-vergleich");
    expect(family).toContain("7,99 €");
    expect(family).toContain("79,99 €");
    expect(family).toMatch(/OpenAI und Datalab/);
    expect(family).toMatch(/USA/);
    expect(family).toMatch(/Einwilligung/);

    const chatgpt = fullText("ordilo-oder-chatgpt-dokumente");
    expect(chatgpt).toMatch(/Ordilo nutzt ebenfalls OpenAI/);
    expect(chatgpt).toMatch(/Datalab/);
    expect(chatgpt).toMatch(/USA/);
    expect(chatgpt).toMatch(/EU/);
    expect(chatgpt).toMatch(/Standardvertragsklauseln/);
  });

  it("is honest about when Ordilo is not the right fit", () => {
    const family = getGuide("dokumenten-app-familie-vergleich")!;
    expect(family.sections.some((s) => s.id === "nicht-ordilo")).toBe(true);
    const chatgpt = getGuide("ordilo-oder-chatgpt-dokumente")!;
    expect(chatgpt.sections.find((s) => s.id === "wann-chatgpt")?.title).toBe(
      "Wann ist ChatGPT die bessere Wahl?",
    );
  });

  it("backs every external product claim with a vendor source and invents no evidence", () => {
    for (const guide of comparisonGuides) {
      const text = fullText(guide.slug);
      for (const [, url] of text.matchAll(/\]\((https:\/\/[^)\s]+)\)/g))
        expect(guide.sources.map((source) => source.url)).toContain(url);
      expect(text).not.toMatch(/Testsieger|Sterne|Nutzer sagen|\d+\s?% der/);
    }
  });
});
