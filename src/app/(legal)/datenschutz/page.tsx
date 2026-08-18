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
 * Datenschutzerklärung — complete: real controller (Erb Invest UG,
 * Hamburg) and processing that matches the actual product architecture:
 * Supabase (EU) for auth, database and storage, OpenAI for document
 * analysis, Datalab for OCR, Resend for transactional email, Vercel for
 * hosting, Sentry for error diagnostics (incl. session replay on
 * errors), no ads, no tracking. Keep this page in sync when processors
 * change.
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
            per Magic-Link, ohne Passwort).
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
            <strong>Technische Nutzungsdaten:</strong> Zeitpunkt der Anmeldung
            sowie inhaltsfreie Ereignisse wie Upload, Suche, Chat-Frage,
            Aufgabe oder Kalendertermin. Wir speichern dabei keine
            Dokumentinhalte, Dateinamen, Suchbegriffe oder Chat-Nachrichten.
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

      <Section title="5. Auftragsverarbeiter">
        <p>Wir setzen folgende Dienstleister ein:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> (Datenbank, Authentifizierung,
            Datei-Speicher; Hosting in der EU) — hier liegen deine
            Dokumente und Kontodaten.
          </li>
          <li>
            <strong>OpenAI</strong> (Dokumentenanalyse und
            Antwort-Generierung) — Dokumenttexte werden zur Analyse an die
            OpenAI-API übermittelt und dort nicht zum Training verwendet.
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
            <strong>Sentry</strong> (Fehlerdiagnose) — bei technischen
            Fehlern werden Gerät, Browser und der Fehlerkontext
            übermittelt. Bei einem Fehler kann zudem eine Aufzeichnung der
            Sitzung angelegt werden, in der Texte und Bilder maskiert
            werden.
          </li>
        </ul>
        <p className="text-muted-foreground">
          Mit allen Auftragsverarbeitern bestehen bzw. werden vor Launch
          Verträge zur Auftragsverarbeitung (Art. 28 DSGVO) geschlossen.
        </p>
      </Section>

      <Section title="6. Übermittlung in Drittländer">
        <p>
          Einige unserer Dienstleister sitzen in den USA (OpenAI, Datalab,
          Resend, Vercel, Sentry). Die Übermittlung personenbezogener Daten
          erfolgt auf Grundlage von Standardvertragsklauseln (Art. 46 Abs. 2
          lit. c DSGVO) beziehungsweise des EU-US Data Privacy Framework,
          soweit der jeweilige Anbieter zertifiziert ist.
        </p>
      </Section>

      <Section title="7. Rechtsgrundlagen">
        <p>
          Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für den Betrieb
          des Dienstes; berechtigtes Interesse (lit. f) für Sicherheit und
          Missbrauchsvermeidung; Einwilligung (lit. a), wo wir sie gesondert
          einholen.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          Ordilo verwendet ausschließlich technisch notwendige Cookies für
          die Anmeldung (Session). Keine Analyse-, Marketing- oder
          Drittanbieter-Cookies — deshalb auch kein Cookie-Banner.
        </p>
      </Section>

      <Section title="9. Speicherdauer und Löschung">
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
      </Section>

      <Section title="10. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch (Art. 15–21 DSGVO) sowie das Recht auf Beschwerde bei
          einer Datenschutz-Aufsichtsbehörde. Wende dich dafür an
          info@ordilo.de.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground">
        Stand: August 2026
      </p>
    </article>
  );
}
