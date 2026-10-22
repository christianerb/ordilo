import type { MetadataRoute } from "next";
import { guides } from "@/content/guides";
import { APP_PREVIEW_VIDEO, SCREENSHOTS, SITE_URL } from "@/lib/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  // Omit lastModified where no reliable editorial date is recorded.
  const pages = [
    "/ratgeber",
    "/hilfe",
    "/ueber-uns",
    "/datenschutz",
    "/impressum",
    "/nutzungsbedingungen",
  ];
  return [
    {
      url: SITE_URL,
      images: SCREENSHOTS.map((shot) => `${SITE_URL}${shot.src}`),
      videos: [
        {
          title: APP_PREVIEW_VIDEO.title,
          description: APP_PREVIEW_VIDEO.description,
          thumbnail_loc: `${SITE_URL}${APP_PREVIEW_VIDEO.poster}`,
          content_loc: `${SITE_URL}${APP_PREVIEW_VIDEO.src}`,
          publication_date: APP_PREVIEW_VIDEO.uploadDate,
        },
      ],
    },
    ...pages.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...guides.map((guide) => ({
      url: `${SITE_URL}/ratgeber/${guide.slug}`,
      lastModified: guide.updated,
      images: [`${SITE_URL}/ratgeber/${guide.slug}/og`],
    })),
  ];
}
