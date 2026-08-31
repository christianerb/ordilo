import type { MetadataRoute } from "next";

const publicPages = ["", "/datenschutz", "/impressum"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map((path, index) => ({
    url: `https://ordilo.de${path}`,
    lastModified: new Date(),
    changeFrequency: index === 0 ? "weekly" : "yearly",
    priority: index === 0 ? 1 : 0.3,
  }));
}
