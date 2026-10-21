import type { MetadataRoute } from "next";
import { guides } from "@/content/guides";
import { SITE_URL } from "@/lib/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  // Omit lastModified where no reliable editorial date is recorded.
  const pages = [
    "",
    "/ratgeber",
    "/hilfe",
    "/datenschutz",
    "/impressum",
    "/nutzungsbedingungen",
  ];
  return [
    ...pages.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...guides.map((guide) => ({
      url: `${SITE_URL}/ratgeber/${guide.slug}`,
      lastModified: guide.updated,
    })),
  ];
}
