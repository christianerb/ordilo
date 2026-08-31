import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/aufgaben/",
        "/dokumente/",
        "/familie/",
        "/home/",
        "/invite/",
        "/login/",
        "/onboarding/",
        "/sammlungen/",
        "/suche/",
      ],
    },
    host: "https://ordilo.de",
    sitemap: "https://ordilo.de/sitemap.xml",
  };
}
