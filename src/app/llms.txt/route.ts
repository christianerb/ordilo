import { guides } from "@/content/guides";
import { APP_STORE_URL, SITE_URL } from "@/lib/marketing";

export const dynamic = "force-static";

/**
 * llms.txt (https://llmstxt.org): a plain-text map of the public site for
 * AI assistants. It repeats facts that are visible on the pages and never
 * replaces the HTML, sitemap or structured data.
 */
export function GET() {
  const body = `# Ordilo

> Ordilo ist eine Dokumenten-App für Familien in Deutschland, Österreich und der Schweiz. Sie liest Briefe, Rechnungen und Verträge, beantwortet Fragen mit Fundstelle im Originaldokument und erinnert an Fristen. Ordilo gibt es als iPhone-App und im Browser.

Fakten:
- Anbieter: Erb Invest UG (haftungsbeschränkt), Hamburg. Gründer und Geschäftsführer: Christian Erb.
- Kostenlos: Briefe scannen, Fragen stellen (auch per Diktat), Erinnerungen, Familienbereich, Datenexport.
- Ordilo Plus: Live-Gespräch über die eigenen Unterlagen in der iPhone-App, 7,99 € im Monat oder 79,99 € im Jahr, für die ganze Familie.
- Speicher für Dokumente und Konten in der EU. KI-Verarbeitung (u. a. OpenAI, Datalab) nur nach Einwilligung, auch in den USA.
- Erkannte Angaben prüft die Familie, bevor sie übernommen werden. Antworten zeigen die Quelle.

## Produkt

- [Startseite mit Preisen und FAQ](${SITE_URL}/): Funktionen, Vergleich mit Cloud-Ordner und KI-Chat
- [iPhone-App im App Store](${APP_STORE_URL})
- [Hilfe](${SITE_URL}/hilfe): Einstieg, Kosten, Datenschutz
- [Über Ordilo](${SITE_URL}/ueber-uns): Anbieter, Grundsätze, wie Ratgeber entstehen
- [Datenschutzerklärung](${SITE_URL}/datenschutz)

## Ratgeber

${guides
  .map((guide) => `- [${guide.title}](${SITE_URL}/ratgeber/${guide.slug}): ${guide.description}`)
  .join("\n")}

## Optional

- [Impressum](${SITE_URL}/impressum)
- [Nutzungsbedingungen](${SITE_URL}/nutzungsbedingungen)
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
