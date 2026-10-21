import type { Metadata } from "next";

export const SITE_URL = "https://ordilo.de";
export const APP_STORE_URL =
  "https://apps.apple.com/de/app/ordilo-dokumente-scanner/id6805133943";

export function publicMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: { "max-image-preview": "large" },
    },
    openGraph: {
      type: "website",
      locale: "de_DE",
      siteName: "Ordilo",
      title,
      description,
      url,
      images: [
        {
          url: `${SITE_URL}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: "Ordilo – Dokumente für die Familie",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}

// Escape HTML delimiters even when content comes from our own editorial files.
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const publisher = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Ordilo",
  url: SITE_URL,
  logo: `${SITE_URL}/icons/icon-512.png`,
  sameAs: ["https://www.instagram.com/ordiloapp/", APP_STORE_URL],
};
