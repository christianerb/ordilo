import type { Metadata } from "next";

export const SITE_URL = "https://ordilo.de";
export const APP_STORE_URL =
  "https://apps.apple.com/de/app/ordilo-dokumente-scanner/id6805133943";

export const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  alt: "Ordilo – Dokumente für die Familie",
};

export function publicMetadata(
  title: string,
  description: string,
  path: string,
  image: { url: string; alt: string } = DEFAULT_OG_IMAGE,
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
        { url: image.url, width: 1200, height: 630, alt: image.alt },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}

// Escape HTML delimiters even when content comes from our own editorial files.
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const FOUNDER_NAME = "Christian Erb";

/** Facts below mirror the Impressum; keep both in sync. */
export const founder = {
  "@type": "Person",
  "@id": `${SITE_URL}/ueber-uns#christian-erb`,
  name: FOUNDER_NAME,
  jobTitle: "Gründer und Geschäftsführer",
  url: `${SITE_URL}/ueber-uns`,
  worksFor: { "@id": `${SITE_URL}/#organization` },
};

export const publisher = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Ordilo",
  legalName: "Erb Invest UG (haftungsbeschränkt)",
  url: SITE_URL,
  logo: `${SITE_URL}/icons/icon-512.png`,
  email: "info@ordilo.de",
  description:
    "Ordilo ist eine Dokumenten-App für Familien: Sie liest Briefe, Rechnungen und Verträge, beantwortet Fragen mit Fundstelle und erinnert an Fristen.",
  founder: { "@id": founder["@id"] },
  address: {
    "@type": "PostalAddress",
    streetAddress: "c/o unicorn workspaces, Burchardstr. 14",
    postalCode: "20095",
    addressLocality: "Hamburg",
    addressCountry: "DE",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "info@ordilo.de",
    url: `${SITE_URL}/hilfe`,
    availableLanguage: "de",
  },
  sameAs: ["https://www.instagram.com/ordiloapp/", APP_STORE_URL],
};

/** Real app views with invented sample data (App Store set 1.0). */
export const SCREENSHOTS = [
  {
    src: "/screenshots/ordilo-frage-mit-antwort.webp",
    width: 660,
    height: 1434,
    caption: "Frage stellen, Antwort mit Quelle bekommen",
    alt: "Ordilo-App: Auf die Frage, bis wann der Handyvertrag kündbar ist, antwortet Ordilo mit dem 30. November 2026 und zeigt die Stelle im Vertrag.",
  },
  {
    src: "/screenshots/ordilo-brief-gelesen.webp",
    width: 660,
    height: 1434,
    caption: "Termine, Fristen und Beträge aus einem Brief",
    alt: "Ordilo-App: Ein Schulbrief zur Klassenfahrt ist gelesen. Rückmeldung, Elternabend, Zahlungsfrist und Abfahrt stehen als Termine bereit.",
  },
  {
    src: "/screenshots/ordilo-fundstelle.webp",
    width: 660,
    height: 1434,
    caption: "Die Fundstelle im Originaltext",
    alt: "Ordilo-App: Die Fundstelle im Originaltext eines Handyvertrags, die Kündigungsfrist ist farbig markiert.",
  },
  {
    src: "/screenshots/ordilo-plus-live-gespraech.webp",
    width: 660,
    height: 1433,
    caption: "Ordilo Plus: live über Unterlagen sprechen",
    alt: "Ordilo Plus in der iPhone-App: Live-Gespräch über eure Familienunterlagen, 7,99 € im Monat oder 79,99 € im Jahr.",
  },
] as const;

export const APP_PREVIEW_VIDEO = {
  src: "/video/ordilo-app-vorschau.mp4",
  poster: "/video/ordilo-app-vorschau.webp",
  width: 540,
  height: 1170,
  durationIso: "PT27S",
  uploadDate: "2026-10-22",
  title: "Ordilo in 27 Sekunden",
  description:
    "Die App-Store-Vorschau von Ordilo: eine Frage zum Handyvertrag eintippen, die Antwort mit Fundstelle bekommen und den Brief im Original sehen. Echte App-Ansichten mit erfundenen Beispieldaten.",
} as const;

export const appPreviewVideoSchema = {
  "@type": "VideoObject",
  "@id": `${SITE_URL}/#app-preview`,
  name: APP_PREVIEW_VIDEO.title,
  description: APP_PREVIEW_VIDEO.description,
  thumbnailUrl: `${SITE_URL}${APP_PREVIEW_VIDEO.poster}`,
  contentUrl: `${SITE_URL}${APP_PREVIEW_VIDEO.src}`,
  uploadDate: APP_PREVIEW_VIDEO.uploadDate,
  duration: APP_PREVIEW_VIDEO.durationIso,
  inLanguage: "de-DE",
  publisher: { "@id": `${SITE_URL}/#organization` },
};

/** The product entity, referenced by @id from every public page. */
export const softwareApplication = {
  "@type": "MobileApplication",
  "@id": `${SITE_URL}/#app`,
  name: "Ordilo",
  alternateName: "Ordilo – Dokumente & Scanner",
  applicationCategory: "ProductivityApplication",
  applicationSubCategory: "Dokumentenverwaltung für Familien",
  operatingSystem: "iOS, Web",
  inLanguage: "de-DE",
  url: SITE_URL,
  downloadUrl: APP_STORE_URL,
  installUrl: APP_STORE_URL,
  publisher: { "@id": publisher["@id"] },
  description:
    "Ordilo ist die Dokumenten-App für Familien. Sie liest Briefe, Rechnungen und Verträge, beantwortet Fragen mit Fundstelle und erinnert an Fristen.",
  featureList: [
    "Briefe und mehrseitige Dokumente scannen",
    "Angaben wie Beträge, Fristen und Vertragsnummern erkennen",
    "Fragen an eigene Unterlagen mit Fundstelle beantworten",
    "Erinnerungen an Fristen",
    "Gemeinsamer Familienbereich",
    "Live-Gespräch über Unterlagen (Ordilo Plus)",
  ],
  screenshot: SCREENSHOTS.map((shot) => `${SITE_URL}${shot.src}`),
  video: { "@id": appPreviewVideoSchema["@id"] },
  isAccessibleForFree: true,
  offers: [
    {
      "@type": "Offer",
      name: "Ordilo Gratis",
      price: "0",
      priceCurrency: "EUR",
      description: "Scannen, Fragen stellen und Erinnerungen für die ganze Familie.",
    },
    {
      "@type": "Offer",
      name: "Ordilo Plus monatlich",
      price: "7.99",
      priceCurrency: "EUR",
      description: "Live-Gespräch in der iPhone-App, für die ganze Familie.",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "7.99",
        priceCurrency: "EUR",
        billingDuration: "P1M",
      },
    },
    {
      "@type": "Offer",
      name: "Ordilo Plus jährlich",
      price: "79.99",
      priceCurrency: "EUR",
      description: "Live-Gespräch in der iPhone-App, für die ganze Familie.",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "79.99",
        priceCurrency: "EUR",
        billingDuration: "P1Y",
      },
    },
  ],
};

/**
 * IndexNow key (public by design): Bing, Yandex & co. fetch /<key>.txt to
 * verify pings from scripts/indexnow.mjs. Bing's index also feeds ChatGPT
 * search and Copilot, so fresh URLs reach AI answers faster.
 */
export const INDEXNOW_KEY = "97c497ac75251ff7dbcc5df553311002";
