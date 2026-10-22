#!/usr/bin/env node
// Ping IndexNow (Bing, Yandex, Seznam, Naver …) with every URL from the live
// sitemap. Bing's index also feeds ChatGPT search and Copilot, so run this
// after each deploy that adds or changes public pages:
//
//   node scripts/indexnow.mjs              # all sitemap URLs
//   node scripts/indexnow.mjs /ratgeber/x  # only the given paths
//
// The key is public by design and served from public/<key>.txt.
import { readFileSync } from "node:fs";

const SITE = "https://ordilo.de";
const key = readFileSync(new URL("../src/lib/marketing.ts", import.meta.url), "utf8")
  .match(/INDEXNOW_KEY = "([a-f0-9]{32})"/)?.[1];
if (!key) throw new Error("INDEXNOW_KEY not found in src/lib/marketing.ts");

async function sitemapUrls() {
  const response = await fetch(`${SITE}/sitemap.xml`);
  if (!response.ok) throw new Error(`sitemap.xml: HTTP ${response.status}`);
  const xml = await response.text();
  // Only page <loc>s; image/video locations use namespaced tags.
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const paths = process.argv.slice(2);
const urlList = paths.length
  ? paths.map((path) => new URL(path, SITE).href)
  : await sitemapUrls();

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList,
  }),
});
// 200 = accepted, 202 = accepted, key validation pending.
console.log(`IndexNow: HTTP ${response.status} for ${urlList.length} URLs`);
if (!response.ok) process.exit(1);
