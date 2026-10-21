import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { guides } from "../guides";
import sitemap from "@/app/sitemap";
import GuidePage, { generateMetadata } from "@/app/ratgeber/[slug]/page";
import { APP_STORE_URL, serializeJsonLd, SITE_URL } from "@/lib/marketing";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("public guide publication", () => {
  it("gives every article a canonical sitemap entry and resolves its related links", async () => {
    const urls = sitemap().map((page) => page.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(new Set(guides.map((guide) => guide.slug)).size).toBe(guides.length);
    for (const guide of guides) {
      const url = `${SITE_URL}/ratgeber/${guide.slug}`;
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: guide.slug }),
      });
      expect(metadata.alternates?.canonical).toBe(url);
      expect(urls).toContain(url);
      expect(new Set(guide.sections.map((section) => section.id)).size).toBe(
        guide.sections.length,
      );
      for (const related of guide.related)
        expect(urls).toContain(`${SITE_URL}/ratgeber/${related}`);
    }
    expect(urls).not.toContain(`${SITE_URL}/login`);
    expect(urls).not.toContain(`${SITE_URL}/dokumente`);
    expect(
      sitemap().find((page) => page.url === SITE_URL)?.lastModified,
    ).toBeUndefined();
  });

  it("serves a full article with one heading, working section targets and matching structured data", async () => {
    const guide = guides[0];
    const { container } = render(
      await GuidePage({ params: Promise.resolve({ slug: guide.slug }) }),
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      guide.title,
    );
    expect(screen.getByText(guide.answer)).toBeDefined();
    for (const section of guide.sections) {
      expect(container.querySelector(`[id="${section.id}"]`)).not.toBeNull();
      expect(
        screen.getByRole("link", { name: section.title }).getAttribute("href"),
      ).toBe(`#${section.id}`);
    }
    expect(
      screen
        .getByRole("link", { name: "Ordilo im App Store laden" })
        .getAttribute("href"),
    ).toBe(APP_STORE_URL);
    const data = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')!
        .textContent!,
    );
    const article = data["@graph"].find(
      (node: { "@type": string }) => node["@type"] === "BlogPosting",
    );
    expect(article.headline).toBe(guide.title);
    expect(article.dateModified).toBe(guide.updated);
    expect(article.datePublished).toBeUndefined();
    expect(article.author["@id"]).toBe(`${SITE_URL}/#organization`);
  });

  it("returns not-found for unknown article content and metadata", async () => {
    const props = { params: Promise.resolve({ slug: "does-not-exist" }) };
    await expect(GuidePage(props)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(props)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("keeps editorial text from terminating an inline JSON-LD script", () => {
    const input = { title: '</script><script>alert("x")</script>' };
    const serialized = serializeJsonLd(input);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(input);
  });
});
