import { listicleGuides } from "./listicle-guides";

/** Editorial source of truth. Dates describe the text, not an invented review. */
export interface Guide {
  slug: string;
  title: string;
  description: string;
  topic: string;
  updated: string;
  answer: string;
  sections: { id: string; title: string; body: string }[];
  sources: { title: string; url: string; note: string }[];
  related: string[];
}

export const guides: Guide[] = [
  {
    slug: "papierkram-organisieren-familie",
    title: "Papierkram organisieren: eine Ablage für die Familie",
    description:
      "Papierkram als Familie organisieren: mit einem Eingang, einfachen Kategorien und klaren Zuständigkeiten. Mit Beispiel und Checkliste für den Start.",
    topic: "Gemeinsame Ablage",
    updated: "2026-10-21",
    answer:
      "Papierkram lässt sich als Familie mit drei festen Schritten organisieren: Neue Post an einem Ort sammeln, offene Aufgaben samt Termin festhalten und erledigte Unterlagen gemeinsam auffindbar ablegen. Entscheidend ist, dass beide wissen, wo ein Dokument liegt und wer sich darum kümmert. Eine App kann dabei helfen; die Absprachen ersetzt sie nicht.",
    sections: [
      {
        id: "ein-eingang",
        title: "Wo fängt man mit einem Stapel Papier an?",
        body: `Beginne mit der neuen Post, nicht mit dem gesamten Archiv. Lege eine feste Schale für Papier an und vereinbare einen digitalen Eingang für PDFs und Fotos. So kommt nicht gleichzeitig neue Unordnung dazu, während du alte Unterlagen sortierst.

Nimm zunächst nur die Briefe, bei denen etwas zu tun ist. Eine Rechnung, eine Rückmeldung an die Kita oder eine Terminbestätigung braucht einen nächsten Schritt. Ein schon erledigter Beleg braucht vor allem einen verlässlichen Ablageplatz.

Unser Vorschlag für den ersten Durchgang: Sortiere in **zu erledigen**, **auf Rückmeldung warten** und **ablegen**. Diese Zustände sagen mehr über die nächste Handlung als ein großer Ordner namens „Wichtig“.`,
      },
      {
        id: "kategorien",
        title: "Welche Kategorien braucht eine Familienablage?",
        body: `Wähle Kategorien, die ihr beide ohne Erklärung versteht. Diese kleine Struktur ist ein Ausgangspunkt; streicht Bereiche, die ihr nicht braucht.

| Bereich | Typische Unterlagen | Suchhilfe |
| --- | --- | --- |
| Kinder, Kita und Schule | Elternbriefe, Anmeldungen, Bescheinigungen | Kind, Einrichtung, Anlass |
| Wohnen | Mietunterlagen, Strom, Internet | Anbieter und Datum |
| Verträge und Versicherungen | Verträge, Nachträge, Schriftverkehr | Vertragspartner und Vertragsnummer |
| Rechnungen und Käufe | Rechnungen, Kaufbelege | Händler, Gegenstand, Datum |
| Persönliche Unterlagen | Bescheinigungen und persönliche Nachweise | Person und Dokumentart |

Für eine gewöhnliche Dateiablage hilft ein Name wie **2026-10-21_Kita-Ausflug_Mila.pdf**. Das ist ein erfundenes Beispiel. Nutzt immer dieselbe Reihenfolge. In einer Dokumenten-App kann zusätzlich die Textsuche helfen; kontrolliert trotzdem, ob der Scan lesbar ist.`,
      },
      {
        id: "zustaendigkeit",
        title: "Wie verteilt man die Arbeit, ohne ständig nachzufragen?",
        body: `Vereinbart zu jedem offenen Vorgang eine zuständige Person, die nächste Handlung und gegebenenfalls einen Termin. „Kita-Brief erledigen“ ist unklar. „Sam übernimmt die Einverständniserklärung und gibt sie bis Freitag ab“ ist überprüfbar.

Die zuständige Person kümmert sich auch um Rückfragen und die Ablage danach. Sonst verteilt ihr nur das Ausführen, während eine Person weiterhin an alles denken muss. Bei Abwesenheit sollte eine zweite erwachsene Person die nötigen Unterlagen finden können.

Eine gemeinsame Ablage bedeutet nicht, dass jedes Familienmitglied alles sehen muss. Überlegt vor dem Teilen, welche privaten Dokumente tatsächlich in den gemeinsamen Bereich gehören.`,
      },
      {
        id: "digital",
        title: "Ordner, Cloud oder Dokumenten-App?",
        body: `**Papierordner** passen, wenn ihr wenig Post bekommt und denselben Ablageort nutzt. **Ein gemeinsamer digitaler Ordner** ist praktisch, wenn ihr hauptsächlich PDFs ablegt und selbst benennt. **Eine Dokumenten-App** ist interessant, wenn ihr viel scannt oder Informationen aus mehreren Unterlagen wiederfinden wollt.

Ordilo verbindet die Familienablage mit Fragen zu gespeicherten Dokumenten. Ihr könnt Briefe scannen oder PDFs hinzufügen und euch Antworten mit Fundstelle anzeigen lassen. Erkannte Angaben prüft ihr, bevor ihr sie übernehmt. Eine KI-Antwort ersetzt das Nachsehen im Original nicht.

Scannen und Fragen sind kostenlos. Nur das Live-Gespräch gehört zum optionalen Ordilo Plus. Details stehen auf der [Startseite mit Preisen](/#preise) und in der [Datenschutzerklärung](/datenschutz).`,
      },
      {
        id: "checkliste",
        title: "Checkliste: Was muss beim ersten Versuch funktionieren?",
        body: `1. Ein neuer Brief landet am vereinbarten Eingang.
2. Ihr erkennt, ob eine Handlung nötig ist.
3. Eine Person übernimmt diese Handlung und den Termin.
4. Der vollständige, lesbare Brief bekommt einen festen Ablageplatz.
5. Die andere Person findet ihn ohne Nachfragen wieder.

Testet das mit einem einzigen Brief. Wenn Schritt fünf scheitert, vereinfacht die Bezeichnung oder den Ablageort. Mehr Unterordner lösen das Problem nicht automatisch.

Ein Scan ist außerdem kein pauschaler Grund, Papier wegzuwerfen. Klärt für das jeweilige Dokument, ob ihr das Original noch benötigt. Dieser Ratgeber gibt keine rechtlichen Aufbewahrungsfristen vor. Für die praktische nächste Aufgabe hilft unser Ablauf zum [Organisieren von Kita- und Schulbriefen](/ratgeber/kita-schulbriefe-organisieren).`,
      },
    ],
    sources: [
      {
        title: "Ordilo: Funktionen und Preise",
        url: "/#preise",
        note: "Produktangaben; die Ablagestruktur und Checkliste sind ein eigener redaktioneller Vorschlag.",
      },
      {
        title: "Ordilo: Umgang mit Dokumenten und KI-Diensten",
        url: "/datenschutz",
        note: "Informationen zur Verarbeitung und zum gemeinsamen Zugriff.",
      },
    ],
    related: ["kita-schulbriefe-organisieren", "dokumente-scannen-iphone"],
  },
  {
    slug: "kita-schulbriefe-organisieren",
    title: "Kita- und Schulbriefe organisieren: vom Zettel zur Aufgabe",
    description:
      "Elternbriefe aus Kita und Schule im Blick behalten: Termin, Rückmeldung und Zuständigkeit festhalten. Mit einem Beispiel für den nächsten Ausflug.",
    topic: "Kita und Schule",
    updated: "2026-10-21",
    answer:
      "Um Kita- und Schulbriefe zu organisieren, halte pro Brief vier Dinge fest: für welches Kind er gilt, was zu tun ist, bis wann und wer es übernimmt. Bewahre den vollständigen Brief gemeinsam auffindbar auf. Ein Kalendereintrag allein reicht nicht, wenn eine Unterschrift, Zahlung oder Rückmeldung vorher fällig ist.",
    sections: [
      {
        id: "vier-fragen",
        title: "Was sollte man aus jedem Elternbrief festhalten?",
        body: `Lies den Brief einmal vollständig und trenne Information von Handlung. Ein Ausflugstermin ist eine Information für den Kalender. Eine Einverständniserklärung braucht eine Aufgabe. Eine Packliste muss am richtigen Tag auffindbar sein.

- **Für wen?** Kind, Gruppe oder Klasse.
- **Was?** Unterschreiben, antworten, bezahlen, mitbringen oder nur merken.
- **Bis wann?** Rückgabefrist und Veranstaltungstermin getrennt.
- **Wer?** Eine zuständige erwachsene Person.

Fehlt eine Angabe oder widersprechen sich zwei Schreiben, frage bei der Einrichtung nach. Ergänze keine vermutete Uhrzeit, nur damit der Kalender vollständig aussieht.`,
      },
      {
        id: "beispiel",
        title: "Wie sieht das bei einem Ausflug konkret aus?",
        body: `Dieses Beispiel ist erfunden: Milas Kita fährt am Donnerstag um 8:30 Uhr zum Bauernhof. Die Einverständniserklärung soll schon am Dienstag zurück sein. Am Ausflugstag braucht Mila einen Rucksack und Regenkleidung.

| Aus dem Brief | Nächster Schritt | Zuständig |
| --- | --- | --- |
| Rückgabe bis Dienstag | Erklärung unterschreiben und abgeben | Sam |
| Donnerstag, 8:30 Uhr | Treffpunkt mit Adresse im Kalender festhalten | Alex |
| Rucksack und Regenkleidung | Am Vorabend anhand des Briefs packen | Alex |

Der Kalendertermin ersetzt die Rückgabe-Aufgabe nicht. Speichert deshalb den Brief so, dass sich beide Erwachsene auf dieselbe Fassung beziehen können. Wenn die Kita später den Treffpunkt ändert, aktualisiert den Termin und kennzeichnet das neue Schreiben eindeutig.`,
      },
      {
        id: "eingang",
        title: "Was tun, wenn Briefe über verschiedene Kanäle kommen?",
        body: `Postmappe, E-Mail und Kita-App bleiben oft nebeneinander bestehen. Ihr müsst nicht die Kommunikation der Einrichtung ändern. Vereinbart stattdessen, wo ihr die Unterlagen sammelt, die für euren Alltag wichtig sind.

Fotografiert Papier vollständig, übernehmt einen PDF-Anhang als Datei und speichert nicht nur einen zugeschnittenen Ausschnitt mit der Uhrzeit. Absender, Datum und Rückfragenkontakt können später wichtig sein. Bei Informationen in einer fremden App nutzt deren angebotene Export- oder Teilen-Funktion, soweit vorhanden.

Prüft anschließend den gespeicherten Inhalt: Sind alle Seiten dabei? Gehören Anhänge dazu? Ist das wirklich die neueste Fassung? Eine doppelt gespeicherte alte Nachricht kann sonst mehr verwirren als helfen.`,
      },
      {
        id: "ordilo",
        title: "Wie kann Ordilo bei Elternbriefen helfen?",
        body: `Mit Ordilo könnt ihr Briefe scannen oder Fotos und PDFs hinzufügen. Die App erkennt Angaben, die ihr prüfen und bestätigen könnt. Danach könnt ihr etwa fragen: „Wann ist der Treffpunkt?“ Ordilo beantwortet Fragen zu euren abgelegten Unterlagen und zeigt die Fundstelle zum Nachsehen.

Prüft bei einer Antwort auch, ob der zitierte Brief zum richtigen Kind und zum aktuellen Termin gehört. KI kann Angaben übersehen oder falsch zuordnen. Gerade eine Rückgabefrist sollte nicht ungeprüft aus einer Antwort übernommen werden.

Familienmitglieder können einen gemeinsamen Bereich nutzen und Aufgaben zuordnen. Sprecht trotzdem ab, wer für die Kommunikation mit der Einrichtung zuständig ist. Die App sendet nicht allein deshalb eine Rückmeldung an die Kita, weil ihr eine Aufgabe angelegt habt.`,
      },
      {
        id: "routine",
        title: "Welche kleine Routine hält das System am Laufen?",
        body: `Wählt einen Zeitpunkt, an dem ihr ohnehin kurz den nächsten Tag besprecht. Schaut dann nur auf neue Briefe und offene Rückmeldungen. Der ganze Dokumentenbestand muss dafür nicht jedes Mal durchgesehen werden.

Drei Fragen reichen für diesen Abgleich: Ist etwas Neues angekommen? Muss vor dem Termin noch etwas erledigt werden? Hat die zuständige Person alles, was sie dafür braucht?

Wenn ihr erst eine gemeinsame Ablage aufbauen wollt, beginnt mit der [Papierkram-Checkliste für Familien](/ratgeber/papierkram-organisieren-familie). Für einen lesbaren Scan findet ihr hier die [Anleitung für das iPhone](/ratgeber/dokumente-scannen-iphone).`,
      },
    ],
    sources: [
      {
        title: "Ordilo: Dokumente und Familienaufgaben",
        url: "/",
        note: "Quelle für die beschriebenen App-Funktionen. Ausflugsbeispiel und Routine sind eigene Vorschläge, keine Vorgaben einer Kita oder Schule.",
      },
      {
        title: "Ordilo: Datenschutz",
        url: "/datenschutz",
        note: "Vor dem Speichern und Teilen personenbezogener Unterlagen beachten.",
      },
    ],
    related: ["papierkram-organisieren-familie", "dokumente-scannen-iphone"],
  },
  {
    slug: "dokumente-scannen-iphone",
    title: "Dokumente mit dem iPhone scannen und wiederfinden",
    description:
      "Briefe mit dem iPhone scannen: ohne Zusatz-App mit Notizen oder mit Ordilo für die Familienablage. Mit Tipps zu Lesbarkeit, mehreren Seiten und Suche.",
    topic: "Scannen und Wiederfinden",
    updated: "2026-10-21",
    answer:
      "Dokumente kannst du auf dem iPhone ohne zusätzliche Scanner-App mit Apple Notizen erfassen. Öffne eine Notiz, wähle über die Anhang-Taste „Dokumente scannen“ und erfasse die Seiten. Prüfe anschließend die Lesbarkeit. Wenn ihr Dokumente gemeinsam ablegen und Fragen dazu stellen wollt, kommt zusätzlich eine Familienablage wie Ordilo infrage.",
    sections: [
      {
        id: "notizen",
        title: "Wie scannt man einen Brief mit Apple Notizen?",
        body: `Apple beschreibt den Scan direkt in der Notizen-App:

1. Öffne eine vorhandene Notiz oder erstelle eine neue.
2. Wähle über die Anhang-Taste „Dokumente scannen“.
3. Richte die Kamera auf den Brief. Die Aufnahme kann automatisch oder manuell erfolgen.
4. Passe bei Bedarf die erkannten Ecken an und übernimm den Scan.
5. Ergänze weitere Seiten und schließe den Scan ab.

Apple bietet die Scan-Funktion auch in der Dateien-App an. Die genaue Darstellung hängt von deiner iOS-Version ab. Die [offizielle Apple-Anleitung](https://support.apple.com/de-de/108963) zeigt die aktuellen Schritte. Für einen gelegentlichen Scan reicht diese vorhandene Funktion oft schon aus.`,
      },
      {
        id: "lesbarkeit",
        title: "Woran erkenne ich einen brauchbaren Scan?",
        body: `Lege den Brief flach auf einen ruhigen Hintergrund und vermeide Schatten deiner Hand. Kontrolliere das Ergebnis, bevor du das Papier beiseitelegst. Besonders kleine Beträge, Fußnoten und der untere Seitenrand werden leicht übersehen.

- Sind alle vier Ränder und sämtliche Seiten vorhanden?
- Lassen sich Datum, Beträge und Nummern beim Vergrößern lesen?
- Sind die Seiten richtig herum und in der richtigen Reihenfolge?
- Gehören Rückseite oder Anlagen zum Schreiben?

Ein scharfes Foto ist noch keine verlässliche Ablage. Gib dem Dokument einen Namen, den du später wiedererkennst, beispielsweise **2026-10-21_Stromanbieter_Abrechnung**. Das Datum und der Anlass helfen dir, mehrere ähnliche Briefe auseinanderzuhalten.`,
      },
      {
        id: "vergleich",
        title: "Wann reicht ein Scan, wann hilft eine Dokumenten-App?",
        body: `Entscheide danach, was nach dem Fotografieren passieren soll.

| Dein Ziel | Passender Ausgangspunkt |
| --- | --- |
| Einen einzelnen Brief digitalisieren | Die Scan-Funktion des iPhones |
| PDFs selbst benennen und ablegen | Eine vereinbarte Datei- und Ordnerstruktur |
| Briefe in der Familie gemeinsam nutzen und Fragen dazu stellen | Eine Familien-Dokumentenablage wie Ordilo |

Das ist eine Entscheidungshilfe, kein vollständiger Funktionsvergleich aller Scanner-Apps. Prüfe bei jeder Lösung, ob die beteiligten Personen Zugriff bekommen, wie du Inhalte wiederfindest und wie du benötigte Daten sichern oder exportieren kannst.`,
      },
      {
        id: "ordilo",
        title: "Wie geht es in Ordilo nach dem Scannen weiter?",
        body: `In der iPhone-App kannst du Briefe scannen und auch mehrere Seiten erfassen. Fotos und PDFs lassen sich ebenfalls hinzufügen. Ordilo liest Inhalte aus und schlägt erkannte Angaben vor; du prüfst, was übernommen werden soll.

Der Unterschied zum bloßen Ablegen zeigt sich später: Du fragst beispielsweise nach einem Termin oder einer Nummer in euren Unterlagen. Ordilo zeigt zur Antwort eine Fundstelle. Öffne sie und kontrolliere die Aussage, besonders bei Beträgen und Fristen.

Scannen und Fragen sind kostenlos. Diktieren per Mikrofon gehört ebenfalls dazu. Das optionale Live-Gespräch mit gesprochenen Antworten ist Teil von Ordilo Plus. Die [aktuellen Preise](/#preise) und [Informationen zur KI-Verarbeitung](/datenschutz) helfen dir bei der Entscheidung.`,
      },
      {
        id: "aufbewahren",
        title: "Was passiert mit dem Papier und der digitalen Kopie?",
        body: `Behalte Originale, solange du nicht geklärt hast, ob du sie noch brauchst. Dieser Artikel beurteilt weder die rechtliche Gültigkeit eines Scans noch Aufbewahrungsfristen. Ein digital lesbarer Brief und ein ersetzbares Original sind zwei unterschiedliche Fragen.

Überlege außerdem, wie du an wichtige Unterlagen kommst, wenn das Telefon verloren geht oder ein Dienst nicht erreichbar ist. Eine Kopie auf demselben Gerät schützt nicht gegen dessen Verlust. Prüfe die Export- und Sicherungsmöglichkeiten deiner gewählten Ablage, bevor du dich vollständig darauf verlässt.

Zum Start genügt ein unkritischer Beispielbrief. Scanne ihn, suche ihn erneut und öffne ihn auf dem vorgesehenen Gerät. Mit der [Familienablage-Checkliste](/ratgeber/papierkram-organisieren-familie) könnt ihr anschließend das gemeinsame Wiederfinden testen.`,
      },
    ],
    sources: [
      {
        title: "Apple Support: Dokumente auf einem iPhone oder iPad scannen",
        url: "https://support.apple.com/de-de/108963",
        note: "Primärquelle für die Scan-Funktion in Notizen und Dateien; abgerufen am 21. Oktober 2026.",
      },
      {
        title: "Ordilo: Funktionen und Preise",
        url: "/#preise",
        note: "Quelle für die Abgrenzung zwischen Gratisfunktionen und optionalem Live-Gespräch.",
      },
      {
        title: "Ordilo: Datenschutz",
        url: "/datenschutz",
        note: "Verarbeitung hochgeladener Dokumente und Einwilligung in KI-Dienste.",
      },
    ],
    related: [
      "papierkram-organisieren-familie",
      "kita-schulbriefe-organisieren",
    ],
  },
  ...listicleGuides,
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}
