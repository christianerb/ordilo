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
 * Product terms for Free and the iOS Plus subscription. Keep store disclosures
 * in sync with the paywall; this copy does not replace legal review.
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

      <Section title="6. Kostenlos nutzen und Ordilo Plus">
        <p>
          Ordilo hat einen kostenlosen Einstieg. Zusätzlich kannst du Ordilo
          Plus als freiwilliges Abo abschließen, sobald es dir in der App
          angeboten wird. Plus enthält unter anderem das Live-Sprachgespräch
          mit Ordilo. Die normale Diktierfunktion ist kein Live-Gespräch und
          setzt kein Plus-Abo voraus.
        </p>
        <p>
          Ein Plus-Abo gilt für den Ordilo-Familienbereich, in dem du es
          abschließt. Die gemeinsame Nutzung erfolgt über eure Ordilo-Konten
          und ist nicht mit Apples Familienfreigabe gleichzusetzen. Die
          enthaltenen Funktionen und gegebenenfalls geltende Nutzungsgrenzen
          zeigen wir dir vor dem Kauf. Es gibt keine automatische Abrechnung
          einzelner zusätzlicher Fragen oder Dokumente.
        </p>
        <p>
          In Deutschland kostet Ordilo Plus 7,99 € pro Monat oder 79,99 € pro
          Jahr, einschließlich der anfallenden Umsatzsteuer. Das Jahresabo
          wird für ein ganzes Jahr im Voraus abgerechnet. Maßgeblich sind der
          Preis, die Währung und der Abrechnungszeitraum, die dir im App Store
          vor der Bestätigung angezeigt werden. Preise in anderen Ländern
          können abweichen. Zum Start gibt es keine kostenlose Testphase des
          Plus-Abos. Ohne deine ausdrückliche Kaufbestätigung entsteht kein
          kostenpflichtiges Abo.
        </p>
        <p>
          Beim Kauf über die iOS-App wird dein Apple-Account nach der
          Kaufbestätigung belastet. Das Abo verlängert sich automatisch um
          den gewählten Monat oder das gewählte Jahr, wenn du es nicht
          spätestens 24 Stunden vor Ablauf des aktuellen Zeitraums kündigst.
          Apple kann die Zahlung für die Verlängerung innerhalb der letzten
          24 Stunden dieses Zeitraums abbuchen.
        </p>
        <p>
          Du kannst die automatische Verlängerung in den Einstellungen deines
          iPhones unter deinem Namen → Abonnements → Ordilo beenden. Nach
          einer Kündigung bleibt Plus grundsätzlich bis zum Ende des bereits
          bezahlten Zeitraums nutzbar. Über „Käufe wiederherstellen“ in der
          App kannst du einen vorhandenen Kauf mit dem verwendeten
          Apple-Account erneut prüfen lassen.
        </p>
        <p>
          Gesetzliche Widerrufs- und Erstattungsrechte bleiben unberührt.
          Informationen zu einem über Apple abgewickelten Kauf und zur
          Beantragung einer Erstattung findest du unter{" "}
          <a className="text-primary underline" href="https://reportaproblem.apple.com">
            reportaproblem.apple.com
          </a>
          . Du kannst dich bei Fragen auch an info@ordilo.de wenden.
        </p>
        <p>
          Für die über den App Store bezogene App gilt ergänzend Apples{" "}
          <a
            className="text-primary underline"
            href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
          >
            Standard-Lizenzvertrag (EULA)
          </a>
          . Diese Nutzungsbedingungen beschreiben die Nutzung des
          Ordilo-Dienstes und ersetzen den Apple-Lizenzvertrag nicht.
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

      <Section title="8. Export und Kontolöschung">
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
        <p>
          Wichtig: Das Löschen deines Kontos oder der App kündigt ein über
          Apple abgeschlossenes Abo nicht automatisch. Beende die
          Verlängerung zusätzlich in deinen Apple-Abonnements, damit keine
          weiteren Zahlungen anfallen.
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

      <p className="text-xs text-muted-foreground">Stand: 16. September 2026</p>
    </article>
  );
}
