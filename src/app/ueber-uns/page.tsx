import Link from "next/link";
import {
  AppInvitation,
  PublicShell,
} from "@/components/ordilo/marketing/public-shell";
import {
  FOUNDER_NAME,
  founder,
  publicMetadata,
  publisher,
  serializeJsonLd,
  SITE_URL,
  softwareApplication,
} from "@/lib/marketing";

export const metadata = publicMetadata(
  "Über Ordilo: wer hinter der Familien-App steht",
  "Ordilo kommt aus Hamburg. Hier erfährst du, wer die App anbietet, wer für die Ratgeber verantwortlich ist und wie wir Inhalte prüfen.",
  "/ueber-uns",
);

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    publisher,
    founder,
    softwareApplication,
    {
      "@type": "AboutPage",
      "@id": `${SITE_URL}/ueber-uns#page`,
      url: `${SITE_URL}/ueber-uns`,
      name: "Über Ordilo",
      inLanguage: "de-DE",
      about: { "@id": publisher["@id"] },
      mainEntity: { "@id": publisher["@id"] },
    },
  ],
};

export default function AboutPage() {
  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <div className="mx-auto max-w-3xl space-y-9">
        <div>
          <p className="text-sm font-medium text-primary">Über Ordilo</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Ein Ort für den Papierkram eurer Familie.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Ordilo ist eine Dokumenten-App für Familien. Sie liest Briefe,
            Rechnungen und Verträge, beantwortet Fragen mit Fundstelle und
            erinnert an Fristen. Ordilo gibt es als iPhone-App und im Browser.
          </p>
        </div>
        <section>
          <h2 className="text-2xl font-semibold">Wer steckt hinter Ordilo?</h2>
          <p className="mt-4 leading-relaxed">
            Ordilo wird von der Erb Invest UG (haftungsbeschränkt) in Hamburg
            entwickelt und betrieben. Gründer und Geschäftsführer ist{" "}
            {FOUNDER_NAME}. Er ist auch für die Inhalte auf ordilo.de
            verantwortlich. Alle Pflichtangaben stehen im{" "}
            <Link className="text-primary underline underline-offset-4" href="/impressum">
              Impressum
            </Link>
            .
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold">Woran wir uns halten</h2>
          <ul className="mt-4 list-disc space-y-3 pl-6 leading-relaxed">
            <li>
              Antworten zeigen, aus welchem Dokument sie stammen. Du kannst
              immer im Original nachsehen.
            </li>
            <li>
              Erkannte Angaben wie Beträge und Termine prüfst du, bevor ihr sie
              übernehmt.
            </li>
            <li>
              Inhalte gehen erst nach deiner Einwilligung an KI-Dienste. Was
              dabei passiert, steht in der{" "}
              <Link className="text-primary underline underline-offset-4" href="/datenschutz">
                Datenschutzerklärung
              </Link>
              .
            </li>
            <li>Keine Werbung und kein Verkauf deiner Daten.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold">So entstehen unsere Ratgeber</h2>
          <p className="mt-4 leading-relaxed">
            Jeder{" "}
            <Link className="text-primary underline underline-offset-4" href="/ratgeber">
              Ratgeber
            </Link>{" "}
            beginnt mit einer kurzen Antwort. Fakten von außen belegen wir mit
            Quellen, zum Beispiel Gesetzestexten oder offiziellen Stellen.
            Eigene Vorschläge und Angaben zur App kennzeichnen wir als solche.
            Beispiele mit Namen sind erfunden. Wir nennen keine erfundenen
            Expertinnen, Erfahrungen oder Zahlen. Unsere Ratgeber ersetzen keine
            Rechts- oder Steuerberatung.
          </p>
          <p className="mt-4 leading-relaxed">
            Fehler gefunden? Schreib uns an{" "}
            <a className="text-primary underline underline-offset-4" href="mailto:info@ordilo.de">
              info@ordilo.de
            </a>
            . Wir korrigieren den Text und aktualisieren das Datum.
          </p>
        </section>
        <AppInvitation />
      </div>
    </PublicShell>
  );
}
