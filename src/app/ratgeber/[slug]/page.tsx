import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { guides, getGuide } from "@/content/guides";
import {
  FOUNDER_NAME,
  founder,
  publicMetadata,
  publisher,
  softwareApplication,
  serializeJsonLd,
  SITE_URL,
} from "@/lib/marketing";
import {
  AppInvitation,
  PublicShell,
} from "@/components/ordilo/marketing/public-shell";

export const dynamicParams = false;
export function generateStaticParams() {
  return guides.map(({ slug }) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

function guideImageUrl(slug: string) {
  return `${SITE_URL}/ratgeber/${slug}/og`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const metadata = publicMetadata(
    `${guide.title} | Ordilo`,
    guide.description,
    `/ratgeber/${guide.slug}`,
    { url: guideImageUrl(guide.slug), alt: guide.title },
  );
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      modifiedTime: guide.updated,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const url = `${SITE_URL}/ratgeber/${guide.slug}`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      publisher,
      founder,
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        url,
        headline: guide.title,
        description: guide.description,
        inLanguage: "de-DE",
        dateModified: guide.updated,
        author: { "@id": publisher["@id"] },
        publisher: { "@id": publisher["@id"] },
        accountablePerson: { "@id": founder["@id"] },
        mentions: { "@id": softwareApplication["@id"] },
        isPartOf: { "@id": `${SITE_URL}/ratgeber#collection` },
        articleSection: guide.topic,
        abstract: guide.answer,
        mainEntityOfPage: url,
        image: guideImageUrl(guide.slug),
        citation: guide.sources.map((source) =>
          source.url.startsWith("/") ? `${SITE_URL}${source.url}` : source.url,
        ),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ordilo", item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "Ratgeber",
            item: `${SITE_URL}/ratgeber`,
          },
          { "@type": "ListItem", position: 3, name: guide.title, item: url },
        ],
      },
    ],
  };
  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
      <nav
        aria-label="Brotkrumennavigation"
        className="mb-8 text-sm text-muted-foreground"
      >
        <Link className="focus-ring underline underline-offset-4" href="/">
          Ordilo
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          className="focus-ring underline underline-offset-4"
          href="/ratgeber"
        >
          Ratgeber
        </Link>
      </nav>
      <article className="mx-auto max-w-3xl [overflow-wrap:anywhere]">
        <p className="text-sm font-medium text-primary">{guide.topic}</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {guide.title}
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          Von{" "}
          <Link className="underline underline-offset-4" href="/impressum">
            Ordilo
          </Link>
          , dem Anbieter der App · Verantwortlich:{" "}
          <Link className="underline underline-offset-4" href="/ueber-uns">
            {FOUNDER_NAME}
          </Link>{" "}
          · Textstand:{" "}
          <time dateTime={guide.updated}>
            {new Intl.DateTimeFormat("de-DE", {
              dateStyle: "long",
              timeZone: "UTC",
            }).format(new Date(guide.updated))}
          </time>
        </p>
        <p className="mt-8 rounded-ordilo-md bg-muted p-5 text-lg leading-relaxed">
          {guide.answer}
        </p>
        <nav
          aria-label="In diesem Ratgeber"
          className="my-9 rounded-ordilo-md bg-muted p-6"
        >
          <p className="font-semibold">In diesem Ratgeber</p>
          <ol className="mt-3 space-y-3">
            {guide.sections.map((section) => (
              <li key={section.id}>
                <a
                  className="focus-ring text-primary underline underline-offset-4"
                  href={`#${section.id}`}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {guide.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="mb-10 scroll-mt-8"
          >
            <h2 className="mb-4 text-2xl font-semibold leading-tight tracking-tight">
              {section.title}
            </h2>
            <div className="space-y-4 text-base leading-7 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto rounded-ordilo-sm border border-border">
                      <table className="w-full min-w-[32rem] text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:p-3 [&_th]:bg-muted [&_th]:p-3">
                        {children}
                      </table>
                    </div>
                  ),
                }}
              >
                {section.body}
              </ReactMarkdown>
            </div>
          </section>
        ))}
        <section
          className="border-t border-border pt-7"
          aria-labelledby="quellen"
        >
          <h2 id="quellen" className="text-xl font-semibold">
            Quellen und Einordnung
          </h2>
          <ul className="mt-4 space-y-4">
            {guide.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  className="focus-ring text-primary underline underline-offset-4"
                >
                  {source.title}
                </a>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {source.note}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-muted-foreground">
            Fragen oder eine Korrektur?{" "}
            <a
              className="focus-ring underline underline-offset-4"
              href="mailto:info@ordilo.de"
            >
              Schreib uns an info@ordilo.de.
            </a>
          </p>
        </section>
        <AppInvitation />
        <nav
          aria-label="Weiterlesen"
          className="mt-10 border-t border-border pt-7"
        >
          <h2 className="text-xl font-semibold">Das passt dazu</h2>
          <ul className="mt-4 space-y-4">
            {guide.related.map((slug) => {
              const related = getGuide(slug);
              return related ? (
                <li key={slug}>
                  <Link
                    className="focus-ring text-primary underline underline-offset-4"
                    href={`/ratgeber/${slug}`}
                  >
                    {related.title}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        </nav>
      </article>
    </PublicShell>
  );
}
