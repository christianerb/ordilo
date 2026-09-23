import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Ordilo",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5 text-sm leading-relaxed">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Product processing notice. DPAs are in place with every processor and
 * the third-country transfer grounds in section 7 match those contracts
 * (DPF: Vercel, Sentry; SCCs: OpenAI, Datalab, Resend, RevenueCat).
 * Sentry and RevenueCat stay conditional until their features switch on.
 */
export default function DatenschutzPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Datenschutzerklärung
      </h1>

      <Section title="1. Verantwortlicher">
        <p>
          Erb Invest UG (haftungsbeschränkt), c/o unicorn workspaces,
          Burchardstr. 14, 20095 Hamburg, E-Mail: info@ordilo.de
        </p>
      </Section>

      <Section title="2. Welche Daten wir verarbeiten">
        <p>
          Ordilo ist ein privater Dokumentenordner für Familien. Wir
          verarbeiten:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Konto-Daten:</strong> deine E-Mail-Adresse (Anmeldung
            mit einem Einmalcode per E-Mail oder, bei bestehenden Konten,
            mit einem Passwort).
          </li>
          <li>
            <strong>Inhalte, die du hochlädst:</strong> gescannte Dokumente,
            Notizen sowie die daraus automatisch erkannten Angaben (z. B.
            Titel, Kategorien, Fristen, Beträge, Nummern, genannte
            Personen).
          </li>
          <li>
            <strong>Familien-Daten:</strong> Name deiner Familie, angelegte
            Familienmitglieder, Einladungen.
          </li>
          <li>
            <strong>Feedback:</strong> optionale Bewertungen von Antworten
            (Daumen hoch/runter, Anmerkung) — ohne Dokumenteninhalte im
            Klartext.
          </li>
          <li>
            <strong>Spracheingaben:</strong> Wenn du eine Frage diktust
            oder „Live mit Ordilo“ startest, wird dein Mikrofonsignal an
            OpenAI übertragen. Ordilo speichert die Audiodaten nicht. Die
            erkannten Fragen und Antworten werden wie andere
            Chat-Nachrichten im Familienverlauf gespeichert.
          </li>
          <li>
            <strong>Technische Nutzungsdaten:</strong> Zeitpunkt der Anmeldung
            sowie inhaltsfreie Ereignisse wie Upload, Suche, Chat-Frage,
            Aufgabe oder Kalendertermin. Wir speichern dabei keine
            Dokumentinhalte, Dateinamen, Suchbegriffe oder Chat-Nachrichten.
          </li>
          <li>
            <strong>Käufe und Abos:</strong> Wenn die Abo-Funktion aktiviert
            ist, nutzen wir die technische Kennung deines Familienbereichs,
            Produkt- und Transaktionskennungen sowie Kauf-, Verlängerungs-,
            Ablauf- und Erstattungsinformationen, um Ordilo Plus zuzuordnen.
            Zahlungsdaten wie deine Kreditkartennummer erhält Ordilo bei
            einem App-Store-Kauf nicht.
          </li>
          <li>
            <strong>Fehlerdiagnose:</strong> bei technischen Fehlern
            Informationen zu Gerät, Browser und dem Kontext des Fehlers
            (Details siehe Abschnitt 5).
          </li>
        </ul>
      </Section>

      <Section title="3. Wofür wir die Daten nutzen">
        <ul className="list-disc space-y-1 pl-5">
          <li>Bereitstellung des Dienstes (Ablage, Suche, Erinnerungen).</li>
          <li>
            Automatische Analyse deiner Dokumente, damit Ordilo sie
            einsortieren und Fragen dazu beantworten kann.
          </li>
          <li>
            Beantwortung gesprochener Fragen und Audioausgabe während eines
            von dir gestarteten Live-Gesprächs.
          </li>
          <li>
            Zuordnung und Prüfung von Abos, Wiederherstellung von Käufen und
            Freischaltung von Plus für den gemeinsamen Familienbereich.
          </li>
          <li>
            Erinnerungs-E-Mails zu Fristen aus deinen bestätigten Aufgaben
            (abschaltbar).
          </li>
          <li>
            Betrieb, Sicherheit und Verbesserung von Ordilo durch eine
            streng eingeschränkte interne Auswertung. Zugriff haben nur
            berechtigte Admins mit zusätzlichem Zugangsschutz.
          </li>
          <li>Keine Werbung, kein Verkauf von Daten und kein Drittanbieter-Tracking.</li>
        </ul>
      </Section>

      <Section title="4. Wo deine Daten liegen und wie sie geschützt sind">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Deine Dokumente und Kontodaten liegen auf Servern in der
            Europäischen Union.
          </li>
          <li>
            Die Übertragung deiner Daten ist verschlüsselt (TLS), und auch
            die Speicherung ist verschlüsselt.
          </li>
          <li>
            Deine Dokumente sind nicht öffentlich. Der Zugriff ist technisch
            auf deine Familie beschränkt; Dateien werden nur über
            kurzlebige, signierte Links ausgeliefert.
          </li>
          <li>
            Wir als Betreiber lesen deine Dokumente nicht mit. Zugriff auf
            die Systeme haben nur berechtigte Admins, gesichert durch einen
            zusätzlichen Zugangsschutz.
          </li>
        </ul>
      </Section>

      <Section title="5. Dienstleister und Empfänger">
        <p>
          Wir setzen folgende Dienstleister ein. Mit allen Dienstleistern,
          die personenbezogene Daten in unserem Auftrag verarbeiten, besteht
          ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO):
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> (Datenbank, Authentifizierung,
            Datei-Speicher; Hosting in der EU) — hier liegen deine
            Dokumente und Kontodaten.
          </li>
          <li>
            <strong>OpenAI</strong> (Dokumentenanalyse und
            Antwort-Generierung sowie Live-Sprache) — Dokumenttexte und,
            wenn du die Live-Funktion startest, Audiodaten werden an die
            OpenAI-API übermittelt und dort nicht zum Training verwendet.
            Ordilo speichert das Live-Audio nicht.
          </li>
          <li>
            <strong>Datalab</strong> (Texterkennung/OCR gescannter
            Dokumente).
          </li>
          <li>
            <strong>Resend</strong> (Versand von E-Mail-Benachrichtigungen,
            z. B. Einladungen und Erinnerungen).
          </li>
          <li>
            <strong>Vercel</strong> (Hosting der Anwendung).
          </li>
          <li>
            <strong>RevenueCat</strong> (Abo-Verwaltung) — erhält bei
            aktivierter Abo-Funktion die technische Familienkennung als
            Kundenkennung sowie Kauf- und Abostatusdaten. Das SDK
            verarbeitet außerdem technische App- und Gerätedaten für die
            Kaufabwicklung. Ordilo übermittelt an RevenueCat keine
            Dokumenttexte, Chat-Inhalte oder Familiennamen.
          </li>
          <li>
            <strong>Apple</strong> (App Store und In-App-Käufe) — wickelt
            Zahlung, Verlängerung und Erstattung über deinen Apple-Account
            ab. Für diese Verarbeitung gelten auch Apples
            Datenschutzinformationen.
          </li>
          <li>
            <strong>Sentry</strong> (Fehlerdiagnose) — bei technischen
            Fehlern werden Gerät, Browser und der Fehlerkontext
            übermittelt. Bei einem Fehler kann zudem eine Aufzeichnung der
            Web-Sitzung angelegt werden, in der Texte und Bilder maskiert
            werden. Die native iPhone-App nutzt Fehlerdiagnose und
            Performance-Messung, aber keine Sitzungsaufzeichnung.
          </li>
        </ul>
        <p className="text-muted-foreground">
          Sentry und RevenueCat werden erst aktiv, wenn die jeweilige
          Funktion eingeschaltet ist (Fehlerdiagnose beim ersten Update nach
          dem Start, Abo-Verwaltung beim Start von Ordilo Plus). Bis dahin
          fließen an sie keine Daten.
        </p>
      </Section>

      <Section title="6. Deine Einwilligung zur KI-Verarbeitung">
        <p>
          Bevor Ordilo Inhalte zum ersten Mal an OpenAI oder Datalab
          überträgt, fragen wir dich ausdrücklich. Erst wenn du zustimmst,
          werden Dokumente zur Analyse und Texterkennung sowie deine Fragen
          und Spracheingaben an diese Dienste gesendet.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Du kannst deine Entscheidung jederzeit in den Einstellungen
            ändern oder widerrufen — mit Wirkung für die Zukunft.
          </li>
          <li>
            Ohne Zustimmung bleiben Scannen, Fragen und Spracheingabe aus.
            Alles andere — Ablage, Aufgaben, Termine, Familie —
            funktioniert weiter.
          </li>
          <li>
            Deine Entscheidung speichern wir mit Zeitpunkt, damit die
            Einwilligung nachweisbar bleibt.
          </li>
        </ul>
      </Section>

      <Section title="7. Übermittlung in Drittländer">
        <p>
          Einige unserer Dienstleister sitzen in den USA (OpenAI, Datalab,
          Resend, Vercel, Sentry, RevenueCat). Dabei können personenbezogene
          Daten in die USA übermittelt werden. Die Übermittlung ist dafür
          jeweils abgesichert:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Vercel und Sentry</strong> sind unter dem EU-US Data
            Privacy Framework zertifiziert. Die Übermittlung stützt sich auf
            den Angemessenheitsbeschluss der Europäischen Kommission
            (Art. 45 DSGVO).
          </li>
          <li>
            <strong>OpenAI, Datalab, Resend und RevenueCat</strong> erhalten
            Daten auf Grundlage der Standardvertragsklauseln der
            Europäischen Kommission (Art. 46 Abs. 2 lit. c DSGVO), jeweils
            als Teil des Vertrags zur Auftragsverarbeitung.
          </li>
          <li>
            <strong>Supabase</strong> speichert deine Daten in der
            Europäischen Union. Für den Fall, dass Supabase Inc. (USA)
            etwa im Rahmen des Supports Zugriff nimmt, gelten ebenfalls
            Standardvertragsklauseln.
          </li>
        </ul>
      </Section>

      <Section title="8. Rechtsgrundlagen">
        <p>
          Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für den Betrieb
          des Dienstes; berechtigtes Interesse (lit. f) für Sicherheit und
          Missbrauchsvermeidung; Einwilligung (lit. a) für die Übertragung
          von Inhalten an die KI-Dienste (siehe Abschnitt 6).
        </p>
      </Section>

      <Section title="9. Cookies">
        <p>
          Ordilo verwendet ausschließlich technisch notwendige Cookies für
          die Anmeldung (Session). Keine Analyse-, Marketing- oder
          Drittanbieter-Cookies — deshalb auch kein Cookie-Banner.
        </p>
      </Section>

      <Section title="10. Speicherdauer und Löschung">
        <p>
          Deine Inhalte bleiben gespeichert, solange dein Konto besteht.
          Gelöschte Dokumente werden endgültig entfernt. Bei Löschung des
          Kontos werden alle personenbezogenen Daten gelöscht, soweit keine
          gesetzlichen Aufbewahrungspflichten bestehen.
        </p>
        <p>
          Inhaltsfreie Nutzungsereignisse bewahren wir höchstens 12 Monate
          auf. Fehlerdiagnose-Daten werden nach 90 Tagen gelöscht.
          Fehlversuche beim zusätzlichen Admin-Zugang werden nur kurz
          für den Schutz vor Missbrauch gespeichert.
        </p>
        <p>
          Kauf- und Abodaten verarbeiten wir, soweit dies für die Abwicklung,
          Wiederherstellung und gesetzliche Aufbewahrung nötig ist. Eine
          Kontolöschung bei Ordilo beendet kein Apple-Abo und löscht nicht
          automatisch die von Apple in eigener Verantwortung geführten
          Kaufbelege.
        </p>
      </Section>

      <Section title="11. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch (Art. 15–21 DSGVO) sowie das Recht auf Beschwerde bei
          einer Datenschutz-Aufsichtsbehörde. Wende dich dafür an
          info@ordilo.de.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground">
        Stand: September 2026
      </p>
    </article>
  );
}
