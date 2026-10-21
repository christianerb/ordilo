import Link from "next/link";
import {
  AppInvitation,
  PublicShell,
} from "@/components/ordilo/marketing/public-shell";
import { publicMetadata } from "@/lib/marketing";

export const metadata = publicMetadata(
  "Ordilo Hilfe: Einstieg, Kosten und Datenschutz",
  "So startest du mit Ordilo: Briefe hinzufügen, Angaben prüfen, Fragen stellen und die Familie einladen. Hilfe zu Gratisfunktionen, Plus und Datenschutz.",
  "/hilfe",
);

export default function HelpPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl space-y-9">
        <div>
          <p className="text-sm font-medium text-primary">Ordilo Hilfe</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Dein erster Brief in Ordilo.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Fang mit einem einfachen Dokument an. Prüfe anschließend, ob du die
            Informationen wiederfindest, die du im Alltag brauchst.
          </p>
        </div>
        <section>
          <h2 className="text-2xl font-semibold">Wie fange ich an?</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-6 leading-relaxed">
            <li>Melde dich an und richte euren Familienbereich ein.</li>
            <li>Scanne einen Brief oder füge ein Foto oder PDF hinzu.</li>
            <li>Prüfe erkannte Angaben und korrigiere sie bei Bedarf.</li>
            <li>
              Stelle eine konkrete Frage und öffne die Fundstelle in der
              Antwort.
            </li>
            <li>
              Lade weitere Personen in den Familienbereich ein, wenn ihr die
              Ablage gemeinsam nutzen wollt.
            </li>
          </ol>
        </section>
        <section>
          <h2 className="text-2xl font-semibold">
            Was ist kostenlos, was gehört zu Plus?
          </h2>
          <p className="mt-4 leading-relaxed">
            Scannen, Fragen stellen und das Diktieren per Mikrofon sind
            kostenlos. Ordilo Plus ergänzt das Live-Gespräch mit gesprochenen
            Antworten in der iPhone-App. Es kostet in Deutschland 7,99 € pro
            Monat oder 79,99 € pro Jahr und gilt für die ganze Familie. Ein Abo
            schließt du ausdrücklich über Apple ab.
          </p>
          <p className="mt-3">
            <Link
              href="/#preise"
              className="text-primary underline underline-offset-4"
            >
              Preise und Funktionsumfang ansehen
            </Link>
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold">
            Was passiert mit meinen Dokumenten?
          </h2>
          <p className="mt-4 leading-relaxed">
            Ordilo fragt nach deiner Einwilligung, bevor Inhalte an KI-Dienste
            gehen. Zu den Dienstleistern gehören OpenAI und Datalab. Dabei
            können Daten auch in die USA übermittelt werden. Die Einwilligung
            kannst du in den Einstellungen ändern. Einzelheiten zu Speicherung,
            Zugriff, Export und Löschung findest du in der{" "}
            <Link
              href="/datenschutz"
              className="text-primary underline underline-offset-4"
            >
              Datenschutzerklärung
            </Link>
            .
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold">
            Was mache ich bei einer falschen Antwort?
          </h2>
          <p className="mt-4 leading-relaxed">
            Öffne die zitierte Fundstelle und prüfe, ob sie zum richtigen
            Dokument gehört. Kontrolliere die Lesbarkeit und Vollständigkeit des
            Scans. Übernimm wichtige Beträge oder Termine nur nach Prüfung. Eine
            KI-Antwort kann falsch sein.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold">Wie erreiche ich euch?</h2>
          <p className="mt-4 leading-relaxed">
            Schreib an{" "}
            <a
              href="mailto:info@ordilo.de"
              className="text-primary underline underline-offset-4"
            >
              info@ordilo.de
            </a>
            . Nenne dein Gerät, die App-Version und die Schritte, bei denen das
            Problem auftritt. Schicke keine Passwörter oder ungeschwärzten
            privaten Dokumente mit.
          </p>
        </section>
        <p>
          <Link
            href="/ratgeber"
            className="text-primary underline underline-offset-4"
          >
            Zu den Ratgebern für euren Papierkram
          </Link>
        </p>
        <AppInvitation />
      </div>
    </PublicShell>
  );
}
