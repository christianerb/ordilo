import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen — Ordilo",
};

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-1.5 text-sm leading-relaxed">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Terms for the current free prelaunch product. A legal review is still
 * required before release, especially before paid plans or subscriptions are
 * introduced. Do not add prices, minimum terms or cancellation periods here
 * until those product and legal decisions are final.
 */
export default function NutzungsbedingungenPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Nutzungsbedingungen
      </h1>

      <Section title="1. Anbieter">
        <p>
          Ordilo wird angeboten von der Erb Invest UG (haftungsbeschränkt),
          c/o unicorn workspaces, Burchardstr. 14, 20095 Hamburg. Du erreichst
          uns unter info@ordilo.de.
        </p>
      </Section>

      <Section title="2. Was Ordilo macht">
        <p>
          Ordilo hilft Familien, eigene Dokumente abzulegen, Angaben daraus zu
          erkennen und Aufgaben oder Termine gemeinsam im Blick zu behalten.
          Die Funktionen dürfen nur für private, rechtmäßige Zwecke genutzt
          werden.
        </p>
      </Section>

      <Section title="3. Konto und Familienbereich">
        <p>
          Du meldest dich mit deiner E-Mail-Adresse an. Je nach Konto nutzt du
          dafür einen Einmalcode oder ein Passwort. Halte deinen Zugang geheim
          und gib nur Personen Zugriff auf den Familienbereich, die eure Daten
          sehen dürfen.
        </p>
        <p>
          Wer eine Familie anlegt, kann weitere Personen einladen. Eingeladene
          Personen können die gemeinsam abgelegten Inhalte sehen und je nach
          Rolle bearbeiten.
        </p>
      </Section>

      <Section title="4. Deine Inhalte">
        <p>
          Du behältst die Rechte an deinen Inhalten. Du darfst nur Dokumente
          und Angaben hochladen, die du rechtmäßig nutzen und mit den Personen
          in deinem Familienbereich teilen darfst. Achte besonders auf Daten
          von Kindern und anderen Personen.
        </p>
        <p>
          Du erlaubst uns, die Inhalte technisch zu speichern und zu
          verarbeiten, soweit das nötig ist, um Ordilo für dich
          bereitzustellen. Mehr dazu steht in der Datenschutzerklärung.
        </p>
      </Section>

      <Section title="5. Künstliche Intelligenz">
        <p>
          Ordilo nutzt künstliche Intelligenz und Texterkennung. Ergebnisse
          können falsch oder unvollständig sein. Prüfe wichtige Angaben,
          Fristen und Antworten am Original. Ordilo ersetzt keine Rechts-,
          Steuer-, Finanz- oder medizinische Beratung.
        </p>
      </Section>

      <Section title="6. Kosten im aktuellen Stand">
        <p>
          Ordilo wird im aktuellen Stand kostenlos bereitgestellt. Es
          gibt derzeit kein kostenpflichtiges Abo in der App. Falls später
          kostenpflichtige Funktionen angeboten werden, zeigen wir Preis,
          Laufzeit und Kündigung vor einem Kauf klar an. Ohne deine
          ausdrückliche Zustimmung entsteht kein kostenpflichtiges Abo.
        </p>
      </Section>

      <Section title="7. Verfügbarkeit">
        <p>
          Wir arbeiten daran, Ordilo zuverlässig bereitzustellen. Wartung,
          technische Fehler oder Dienste Dritter können die Nutzung zeitweise
          einschränken. Sichere wichtige Originale deshalb auch außerhalb von
          Ordilo.
        </p>
      </Section>

      <Section title="8. Export, Kündigung und Löschung">
        <p>
          Du kannst deine Daten in den Einstellungen als JSON-Datei
          exportieren. Originaldateien sind nicht Teil dieser JSON-Datei und
          können bei den einzelnen Dokumenten geöffnet oder geteilt werden.
        </p>
        <p>
          Du kannst dein Konto in den Einstellungen löschen. Wer eine Familie
          angelegt hat, löscht damit auch den gemeinsamen Familienbereich.
          Eingeladene Personen löschen nur ihr eigenes Konto und ihren Zugang;
          die Daten der übrigen Familie bleiben bestehen.
        </p>
      </Section>

      <Section title="9. Gesetzliche Rechte">
        <p>
          Es gelten die gesetzlichen Rechte. Zwingende Rechte von
          Verbraucherinnen und Verbrauchern werden durch diese Bedingungen
          nicht eingeschränkt.
        </p>
      </Section>

      <Section title="10. Änderungen">
        <p>
          Wenn sich Ordilo oder die rechtlichen Anforderungen ändern, können
          diese Bedingungen für die Zukunft angepasst werden. Über wichtige
          Änderungen informieren wir verständlich. Soweit deine Zustimmung
          nötig ist, fragen wir dich vorher.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground">Stand: September 2026</p>
    </article>
  );
}
