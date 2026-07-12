import type { Metadata } from "next";
import { PlaceholderNotice } from "../placeholder-notice";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Ordilo",
  robots: { index: false },
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
 * Datenschutzerklärung — the CONTROLLER details are placeholders
 * ([brackets], see PlaceholderNotice), but the described processing
 * matches the actual product architecture: Supabase (EU) for auth,
 * database and storage, OpenAI for document analysis, Resend for
 * transactional email, no ads, no tracking. Keep this page in sync when
 * processors change. noindex until the placeholders are replaced.
 */
export default function DatenschutzPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Datenschutzerklärung
      </h1>

      <PlaceholderNotice />

      <Section title="1. Verantwortlicher">
        <p>
          [Musterfirma UG (haftungsbeschränkt)], [Musterstraße 1],
          [12345 Musterstadt], E-Mail: [datenschutz@ordilo.example]
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
          <li>Keine Werbung. Kein Verkauf von Daten. Kein Tracking.</li>
        </ul>
      </Section>

      <Section title="4. Auftragsverarbeiter">
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
            <strong>Resend</strong> (Versand von Erinnerungs-E-Mails).
          </li>
          <li>
            <strong>Vercel</strong> (Hosting der Anwendung).
          </li>
        </ul>
        <p className="text-muted-foreground">
          Mit allen Auftragsverarbeitern bestehen bzw. werden vor Launch
          Verträge zur Auftragsverarbeitung (Art. 28 DSGVO) geschlossen.
        </p>
      </Section>

      <Section title="5. Rechtsgrundlagen">
        <p>
          Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für den Betrieb
          des Dienstes; berechtigtes Interesse (lit. f) für Sicherheit und
          Missbrauchsvermeidung; Einwilligung (lit. a), wo wir sie gesondert
          einholen.
        </p>
      </Section>

      <Section title="6. Cookies">
        <p>
          Ordilo verwendet ausschließlich technisch notwendige Cookies für
          die Anmeldung (Session). Keine Analyse-, Marketing- oder
          Drittanbieter-Cookies — deshalb auch kein Cookie-Banner.
        </p>
      </Section>

      <Section title="7. Speicherdauer und Löschung">
        <p>
          Deine Inhalte bleiben gespeichert, solange dein Konto besteht.
          Gelöschte Dokumente werden endgültig entfernt. Bei Löschung des
          Kontos werden alle personenbezogenen Daten gelöscht, soweit keine
          gesetzlichen Aufbewahrungspflichten bestehen.
        </p>
      </Section>

      <Section title="8. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch (Art. 15–21 DSGVO) sowie das Recht auf Beschwerde bei
          einer Datenschutz-Aufsichtsbehörde. Wende dich dafür an
          [datenschutz@ordilo.example].
        </p>
      </Section>

      <p className="text-xs text-muted-foreground">
        Stand: [Monat Jahr] — diese Erklärung wird vor dem Launch final
        geprüft und mit den echten Angaben versehen.
      </p>
    </article>
  );
}
