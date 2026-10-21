import Link from "next/link";
import { guides } from "@/content/guides";
import {
  publicMetadata,
  publisher,
  serializeJsonLd,
  SITE_URL,
} from "@/lib/marketing";
import {
  AppInvitation,
  PublicShell,
} from "@/components/ordilo/marketing/public-shell";

export const metadata = publicMetadata(
  "Papierkram im Familienalltag: Ratgeber | Ordilo",
  "Praktische Anleitungen für eure Familienablage: Papierkram organisieren, Kita-Briefe im Blick behalten und Dokumente mit dem iPhone scannen.",
  "/ratgeber",
);

export default function GuidesPage() {
  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Ordilo Ratgeber",
            url: `${SITE_URL}/ratgeber`,
            publisher,
            mainEntity: {
              "@type": "ItemList",
              itemListElement: guides.map((guide, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: guide.title,
                url: `${SITE_URL}/ratgeber/${guide.slug}`,
              })),
            },
          }),
        }}
      />
      <p className="text-sm font-medium text-primary">Ordilo Ratgeber</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
        Weniger suchen.
        <br />
        Mehr Familienalltag.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Ein Brief, drei Termine, fünf offene Fragen? Hier findet ihr Anleitungen
        für Papierkram, Kita-Post und eine Ablage, die ihr beide versteht.
      </p>
      <div className="mt-12 divide-y divide-border border-y border-border">
        {guides.map((guide, index) => (
          <article
            key={guide.slug}
            className="grid gap-4 py-8 sm:grid-cols-[3rem_1fr]"
          >
            <span
              className="text-lg font-medium text-primary"
              aria-hidden="true"
            >
              0{index + 1}
            </span>
            <div>
              <p className="text-sm text-muted-foreground">{guide.topic}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                <Link
                  href={`/ratgeber/${guide.slug}`}
                  className="focus-ring rounded-sm hover:text-primary"
                >
                  {guide.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
                {guide.description}
              </p>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Diese Ratgeber werden von Ordilo, dem Anbieter der App, veröffentlicht.
        Eigene Organisationsvorschläge und Produktangaben sind als solche
        erkennbar; externe Anleitungen sind verlinkt.
      </p>
      <AppInvitation />
    </PublicShell>
  );
}
