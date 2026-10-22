import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { GET as llmsTxt } from "@/app/llms.txt/route";
import { guides } from "@/content/guides";
import { INDEXNOW_KEY, SITE_URL } from "@/lib/marketing";
import { isPublicMarketingPath } from "@/lib/public-routes";

describe("SEO and GEO routes", () => {
  it("lists every guide in llms.txt with its canonical URL", async () => {
    const body = await llmsTxt().text();
    expect(body.startsWith("# Ordilo\n")).toBe(true);
    for (const guide of guides) {
      expect(body).toContain(`${SITE_URL}/ratgeber/${guide.slug}`);
    }
  });

  it("puts the about page, screenshots and the app video in the sitemap", () => {
    const entries = sitemap();
    const home = entries.find((entry) => entry.url === SITE_URL);
    expect(home?.images?.length).toBeGreaterThan(0);
    expect(home?.videos?.[0]?.content_loc).toMatch(/\.mp4$/);
    expect(entries.map((entry) => entry.url)).toContain(`${SITE_URL}/ueber-uns`);
  });

  it("serves the IndexNow key file and keeps it outside the session middleware", () => {
    const file = readFileSync(join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`), "utf8");
    expect(file.trim()).toBe(INDEXNOW_KEY);
    expect(isPublicMarketingPath(`/${INDEXNOW_KEY}.txt`)).toBe(true);
  });

  it("keeps public pages crawlable and private app routes blocked", () => {
    const rules = robots().rules as { allow: string; disallow: string[] };
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(expect.arrayContaining(["/dokumente/", "/api/"]));
    expect(rules.disallow).not.toContain("/ueber-uns/");
  });
});
