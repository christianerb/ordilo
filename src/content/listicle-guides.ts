import type { Guide } from "./guides";

export const listicleGuides: Guide[] = [
  {
    slug: "wochenplan-familie",
    title: "Wochenplan für die Familie: 7 Schritte und eine Vorlage",
    description:
      "Einen Wochenplan für die Familie erstellen: Termine, Aufgaben und Zuständigkeiten auf einen Blick. Mit kopierbarer Vorlage und sieben praktischen Schritten.",
    topic: "Die Woche planen",
    updated: "2026-10-21",
    answer:
      "Ein brauchbarer Wochenplan für die Familie zeigt feste Termine, nötige Vorbereitungen und eine zuständige Person pro Aufgabe. Tragt zuerst die unveränderlichen Termine ein, ergänzt Wege und Rückgabefristen und lasst Platz für Änderungen. Die Vorlage unten könnt ihr auf Papier oder in einer gemeinsamen Datei verwenden.",
    sections: [
      {
        id: "vorlage",
        title: "Die Wochenplan-Vorlage zum Kopieren",
        body: `Übernehmt diese Tabelle in eine gemeinsame Notiz oder druckt sie über euren Browser aus. Die Zeilen sind ein erfundenes Beispiel. Ersetzt sie durch eure eigene Woche; auch leere Tage dürfen leer bleiben.

| Tag | Fester Termin | Vorher zu erledigen | Wer übernimmt? |
| --- | --- | --- | --- |
| Montag | Sport, 16 Uhr | Tasche packen, Abholung klären | Alex |
| Dienstag | Kein gemeinsamer Termin | Ausflugserklärung abgeben | Sam |
| Mittwoch | Elternabend, 19 Uhr | Betreuung vereinbaren | Alex |
| Donnerstag | Kita-Ausflug, 8:30 Uhr | Rucksack und Regenkleidung | Sam |
| Freitag | Frei lassen | Neue Briefe durchsehen | Alex |
| Samstag | Gemeinsamer Ausflug | Wetter und Anreise prüfen | Sam |
| Sonntag | Wochenblick | Nächste Woche gemeinsam abstimmen | Beide |

Wichtig ist die Trennung von **Termin** und **Vorbereitung**: Eine Erklärung am Dienstag kann für einen Ausflug am Donnerstag nötig sein. Eine zusätzliche Spalte für den Ablageort des Briefs hilft, wenn weitere Einzelheiten nachzulesen sind.`,
      },
      {
        id: "termine",
        title: "1. Erst die festen Termine sammeln",
        body: `Beginnt mit Arbeitszeiten, Betreuung, Schule und bereits vereinbarten Terminen. Sammelt die Angaben aus Kalendern und aktuellen Briefen, bevor ihr neue Aktivitäten plant. Prüft bei jedem Eintrag Datum und Uhrzeit an der ursprünglichen Quelle.

Tragt nur das ein, was die gemeinsame Planung beeinflusst. Wenn der Familienplan jede persönliche Kleinigkeit enthält, wird er schnell unübersichtlich. Private Termine können privat bleiben; ein belegtes Zeitfenster reicht oft als Information.`,
      },
      {
        id: "wege",
        title: "2. Wege und Übergaben mitdenken",
        body: `Ein Termin beginnt organisatorisch nicht erst am Ziel. Wer bringt das Kind hin, wer holt es ab und wann muss die Person los? Ergänzt diese Absprachen direkt zum Eintrag. „Sport, 16 Uhr“ lässt diese Fragen offen.

Plant Zeit für den tatsächlichen Weg ein. Wenn zwei Termine nur ohne Fahrtzeit nebeneinanderpassen, passen sie im Alltag nicht. Prüft solche Überschneidungen gemeinsam, bevor die Woche beginnt.`,
      },
      {
        id: "vorbereitung",
        title: "3. Vorbereitung als eigene Aufgabe notieren",
        body: `Schreibt zu wichtigen Terminen die nötige Vorbereitung auf: Formular abgeben, Tasche packen oder Unterlagen bereitlegen. Hat eine Aufgabe eine frühere Frist, bekommt sie auch einen früheren Platz im Plan.

Verweist auf den vollständigen Brief, statt alle Details mehrfach abzuschreiben. Unser [Ablauf für Kita- und Schulbriefe](/ratgeber/kita-schulbriefe-organisieren) zeigt, wie Termin und Rückmeldung auseinandergehalten werden.`,
      },
      {
        id: "verantwortung",
        title: "4. Eine Person übernimmt den ganzen Vorgang",
        body: `„Wir kümmern uns“ klingt gut, ist aber schwer überprüfbar. Vereinbart pro Aufgabe eine Person. Zum Übernehmen gehört auch, fehlende Informationen zu besorgen und nach einer Änderung Bescheid zu geben.

Verteilt nach verfügbarer Zeit und Belastung, nicht nur nach der Anzahl der Zeilen. Eine kurze Abholung und die Vorbereitung eines Elternabends können sehr unterschiedlich aufwendig sein. Die Tabelle ist ein Gesprächsstart, keine Punkteliste.`,
      },
      {
        id: "luft",
        title: "5. Nicht jede Lücke verplanen",
        body: `Lasst freie Zeit im Plan. Eine verspätete Abholung, ein verschobener Termin oder ein anstrengender Tag braucht Spielraum. Ein leerer Nachmittag ist kein Fehler in der Organisation.

Fragt vor zusätzlichen Vorhaben: Muss das diese Woche sein? Was fällt dafür weg? Kürzt im Zweifel die Liste, statt einen immer feineren Plan zu bauen. Ein realistischer Plan ist nützlicher als ein vollständiger Wunschzettel.`,
      },
      {
        id: "gemeinsam",
        title: "6. Einen gemeinsam erreichbaren Plan wählen",
        body: `Papier funktioniert, wenn alle den Plan regelmäßig sehen. Eine gemeinsame digitale Notiz passt, wenn ihr vor allem eine Liste braucht. Ein geteilter Kalender hilft bei Terminen unterwegs. Entscheidend ist, dass jede zuständige Person die aktuelle Fassung öffnen kann.

Google beschreibt beispielsweise einen Familienkalender, der bei einer Google-Familiengruppe entsteht. Prüft vor der Nutzung die Freigaben in der [offiziellen Anleitung](https://support.google.com/calendar/answer/7157782?hl=de). Dieser Artikel verspricht keine automatische Synchronisierung mit Ordilo.`,
      },
      {
        id: "wochenblick",
        title: "7. Am Wochenende kurz nachjustieren",
        body: `Schaut gemeinsam auf offene Aufgaben und die nächste Woche. Was wurde verschoben? Welche neuen Briefe sind angekommen? Muss eine Zuständigkeit wechseln? Ändert den vorhandenen Plan, statt einen zweiten daneben anzulegen.

Probiert das zunächst eine Woche lang. Wenn ihr den Plan nicht nutzt, fragt nach dem Grund: zu viele Einträge, schlechter Zugriff oder unklare Zuständigkeiten? Ändert genau diesen Punkt. Für die Unterlagen hinter den Terminen kann Ordilo eine gemeinsame Ablage mit Fragen und Fundstellen ergänzen. Die Planung und Prüfung bleiben bei euch.`,
      },
    ],
    sources: [
      {
        title: "Google Kalender-Hilfe: Familienkalender verwenden",
        url: "https://support.google.com/calendar/answer/7157782?hl=de",
        note: "Primärquelle für den genannten Google-Familienkalender. Die Wochenplan-Vorlage und sieben Schritte sind eigene redaktionelle Vorschläge.",
      },
      {
        title: "Ordilo: Funktionen und Einstieg",
        url: "/hilfe",
        note: "Produktumfang; keine behauptete Kalender-Synchronisierung oder automatische Erledigung.",
      },
    ],
    related: [
      "familienalltag-organisieren-tipps",
      "kita-schulbriefe-organisieren",
    ],
  },
  {
    slug: "private-dokumente-digitalisieren",
    title:
      "Private Dokumente digitalisieren: 10 Tipps für eine nutzbare Ablage",
    description:
      "Private Dokumente digitalisieren: zehn praktische Tipps von der Auswahl über Dateinamen bis zum Wiederfinden. Mit Checkliste für den ersten Testlauf.",
    topic: "Digitalisieren mit System",
    updated: "2026-10-21",
    answer:
      "Private Dokumente digitalisierst du am besten in kleinen, überprüfbaren Schritten: wichtige Unterlagen auswählen, vollständig scannen, verständlich benennen und an einem festen Ort speichern. Prüfe anschließend Suche, Zugriff und Sicherung. Ein Scan allein ist noch keine brauchbare Ablage und kein pauschaler Grund, das Original wegzuwerfen.",
    sections: [
      {
        id: "klein-starten",
        title: "1. Mit einer überschaubaren Dokumentengruppe starten",
        body: `Nimm zunächst die neue Post oder die Unterlagen zu einem aktuellen Vorgang. Der gesamte Keller muss nicht am ersten Wochenende digital werden. Wähle eine Gruppe, die du anschließend wirklich brauchst, etwa die Briefe zum nächsten Kita-Ausflug.

So merkst du früh, ob dein Ablauf funktioniert. Korrigiere Benennung und Ablage bei fünf Dateien, bevor du denselben Fehler auf fünfhundert überträgst.`,
      },
      {
        id: "trennen",
        title: "2. Offene Aufgaben vor dem Scannen erkennen",
        body: `Ein Brief kann eine Zahlung, Unterschrift oder Rückmeldung verlangen. Notiere diesen nächsten Schritt, bevor das Papier im Stapel „gescannt“ verschwindet. Digitalisieren erledigt die Aufgabe im Brief nicht.

Für Vorgänge mit Frist braucht es eine zuständige Person und einen Termin. Die digitale Kopie dient als Nachschlageort. Wie ihr solche Aufgaben gemeinsam verteilt, zeigt die [Familienablage-Anleitung](/ratgeber/papierkram-organisieren-familie).`,
      },
      {
        id: "vollstaendig",
        title: "3. Alle Seiten und Anlagen erfassen",
        body: `Prüfe Vorderseite, Rückseite und Anlagen. Ein sauberer Ausschnitt mit dem Betrag hilft wenig, wenn Vertragsnummer, Absender oder Erläuterung fehlen. Halte die Seiten eines Schreibens in einer nachvollziehbaren Reihenfolge zusammen.

Kontrolliere schon nach dem ersten Scan die Ränder. Dann kannst du Licht und Kameraposition anpassen, bevor du einen ganzen Stapel mit abgeschnittenen Zeilen produzierst.`,
      },
      {
        id: "lesbarkeit",
        title: "4. Das Ergebnis vergrößern und nachlesen",
        body: `Öffne den Scan und lies eine kleine Nummer, ein Datum und eine Zeile am unteren Rand. Sind sie unscharf, nimm die Seite neu auf. Die Miniaturansicht reicht für diese Prüfung nicht.

Eine Texterkennung kann eine Suche erleichtern, aber Zeichen verwechseln. Prüfe wichtige Angaben im sichtbaren Dokument. Für die reine Aufnahme findest du eine eigene [iPhone-Scan-Anleitung](/ratgeber/dokumente-scannen-iphone).`,
      },
      {
        id: "dateinamen",
        title: "5. Dateinamen nach einer festen Regel vergeben",
        body: `Für eine Dateiablage eignet sich etwa **Datum_Absender_Anlass**. Das erfundene Beispiel **2026-10-21_Stromanbieter_Abrechnung.pdf** ist verständlicher als „Scan_0042_final_neu.pdf“. Verwendet innerhalb der Familie dieselbe Reihenfolge.

Überladet den Namen nicht mit vertraulichen Angaben. Eine vollständige Konto- oder Ausweisnummer muss nicht im Dateinamen stehen. Benennt so viel, wie ihr zum Wiederfinden braucht.`,
      },
      {
        id: "ordner",
        title: "6. Wenige Kategorien statt tiefer Ordnerbäume nutzen",
        body: `Beginnt zum Beispiel mit Wohnen, Kinder, Verträge und Rechnungen. Unterteilt erst, wenn ihr innerhalb einer Kategorie tatsächlich nicht mehr zurechtkommt. Jede zusätzliche Ebene verlangt eine weitere Entscheidung beim Ablegen.

Die Probe ist einfach: Kann eine andere berechtigte Person den Ablageort vorhersagen? Wenn nicht, vereinheitlicht die Begriffe. Eine [private Ordnerstruktur mit Beispielen](/ratgeber/papierkram-organisieren-familie#kategorien) findet ihr im Grundlagenartikel.`,
      },
      {
        id: "fassung",
        title: "7. Die aktuelle Fassung erkennbar halten",
        body: `Ein korrigierter Brief sollte nicht unbemerkt neben der alten Fassung liegen. Kennzeichnet den neuen Stand mit Datum und Anlass. Falls ihr die ältere Version benötigt, legt sie erkennbar als frühere Fassung ab.

Prüft bei Rückfragen immer, auf welches Schreiben ihr euch bezieht. Eine schnelle Suche ist nur dann hilfreich, wenn das gefundene Dokument auch zum richtigen Vorgang und Zeitraum gehört.`,
      },
      {
        id: "zugriff",
        title: "8. Gemeinsamen Zugriff bewusst einrichten",
        body: `Entscheidet, welche Unterlagen gemeinsam gebraucht werden und welche persönlich bleiben. Testet den Zugriff mit dem tatsächlich vorgesehenen Konto. „Ich habe dir den Link geschickt“ ist noch kein Beleg dafür, dass die andere Person ihn öffnen kann.

In Ordilo können eingeladene Personen gemeinsame Unterlagen nutzen. Informiert euch vor dem Hochladen über die [KI-Verarbeitung und Einwilligung](/datenschutz). Eine Familienablage sollte nicht automatisch alles enthalten, was auf einem privaten Gerät liegt.`,
      },
      {
        id: "sicherung",
        title: "9. Sicherung und Export vor dem Ernstfall prüfen",
        body: `Überlegt, wie ihr wichtige Dateien wiederbekommt, wenn ein Gerät verloren geht oder ein Dienst nicht erreichbar ist. Eine zweite Kopie auf demselben Telefon hilft bei dessen Verlust nicht.

Prüft die angebotenen Export- und Sicherungsfunktionen eurer gewählten Ablage mit einer Testdatei. Lässt sie sich herunterladen und öffnen? Behaltet Papieroriginale, solange nicht geklärt ist, ob ihr sie noch braucht. Dieser Artikel legt keine rechtlichen Aufbewahrungsfristen fest.`,
      },
      {
        id: "testlauf",
        title: "10. Das Wiederfinden testen, bevor der nächste Stapel kommt",
        body: `Lasst eine berechtigte zweite Person einen Testbrief suchen. Gebt nur die Information, die im Alltag realistisch wäre: „Der Brief zum Ausflug nächste Woche“. Prüft gemeinsam, ob die richtige Datei und die nötige Angabe gefunden werden.

**Euer Testlauf:** vollständiger Scan, lesbarer Inhalt, klarer Name, richtiger Zugriff und funktionierender Export. Erst danach wird der nächste Stapel digitalisiert. Ordilo kann Fragen an die abgelegten Dokumente mit Fundstellen ergänzen; wichtige Angaben kontrolliert ihr weiterhin im Original.`,
      },
    ],
    sources: [
      {
        title: "Ordilo: Funktionen und Hilfe",
        url: "/hilfe",
        note: "Produktangaben. Die zehn Tipps und Beispiele sind eigene Organisationsvorschläge, keine rechtliche Archivierungsanleitung.",
      },
      {
        title: "Ordilo: Datenschutz",
        url: "/datenschutz",
        note: "Gemeinsamer Zugriff, KI-Einwilligung und Umgang mit gespeicherten Unterlagen.",
      },
    ],
    related: ["dokumente-scannen-iphone", "papierkram-organisieren-familie"],
  },
  {
    slug: "familienalltag-organisieren-tipps",
    title: "Familienalltag organisieren: 10 Tipps, die ihr ausprobieren könnt",
    description:
      "Familienalltag organisieren mit zehn konkreten Tipps: Zuständigkeiten, Wochenplan, Übergaben und Papierkram. Ohne den Anspruch, jeden Tag perfekt zu planen.",
    topic: "Gemeinsam organisieren",
    updated: "2026-10-21",
    answer:
      "Den Familienalltag könnt ihr mit einem gemeinsamen Wochenblick, klaren Zuständigkeiten und festen Orten für wichtige Informationen organisieren. Wählt zuerst eine Situation, die regelmäßig hakt, und probiert dafür eine kleine Änderung aus. Die folgenden zehn Tipps sind Vorschläge zum Testen, keine Rangliste wissenschaftlich bewiesener Methoden.",
    sections: [
      {
        id: "ein-problem",
        title: "1. Ein wiederkehrendes Problem auswählen",
        body: `Schreibt nicht sofort euren ganzen Alltag um. Nehmt die Situation, die gerade am meisten Rückfragen erzeugt: fehlende Sportsachen, unklare Abholung oder verlegte Briefe. Beschreibt konkret, was passieren soll.

„Besser organisiert sein“ ist schwer zu prüfen. „Am Vorabend weiß jede Person, wer morgen abholt“ ist ein brauchbarer Anfang. Nach einer Woche könnt ihr besprechen, ob die neue Absprache geholfen hat.`,
      },
      {
        id: "wochenblick",
        title: "2. Die Woche gemeinsam überblicken",
        body: `Legt die festen Termine nebeneinander und schaut nach Überschneidungen. Ergänzt Wege und Aufgaben, die vor einem Termin erledigt werden müssen. Geht davon aus, dass sich unterwegs etwas ändern kann.

Ein überschaubarer [Wochenplan für die Familie](/ratgeber/wochenplan-familie) reicht für den Anfang. Er muss nicht hübsch sein. Er muss erreichbar sein und zeigen, was diese Woche wirklich vereinbart ist.`,
      },
      {
        id: "komplett",
        title: "3. Ganze Aufgaben übergeben",
        body: `Wer eine Aufgabe übernimmt, klärt auch die offenen Fragen dazu. Beim Kita-Ausflug gehören Lesen, Rückmeldung und Vorbereitung zusammen. Sonst wandert nur die letzte Handbewegung weiter, während eine Person alles andere im Kopf behält.

Sagt deutlich, was zum Vorgang gehört und wann er abgeschlossen ist. Das ist eine Absprache zwischen euch, keine automatische Folge eines Häkchens in einer App.`,
      },
      {
        id: "ablage",
        title: "4. Einen Eingang für neue Post vereinbaren",
        body: `Neue Briefe brauchen einen festen ersten Ort. Vereinbart eine Schale oder einen digitalen Eingang, den die zuständigen Erwachsenen kennen. Die Post soll dort kurz landen, nicht dauerhaft verschwinden.

Trennt beim Durchsehen offene Aufgaben von Unterlagen, die nur abgelegt werden. Für den Aufbau hilft unser [Ratgeber zur Familienablage](/ratgeber/papierkram-organisieren-familie). Ein neuer Ablageort allein bearbeitet noch keinen Brief.`,
      },
      {
        id: "termin-aufgabe",
        title: "5. Termine und Aufgaben auseinanderhalten",
        body: `„Ausflug Donnerstag“ sagt nicht, dass das Formular am Dienstag zurück muss. Haltet Vorbereitung und Veranstaltung getrennt fest. Verweist für Einzelheiten auf die ursprüngliche Nachricht.

Wenn eine Information fehlt, fragt nach. Eine erfundene Uhrzeit macht den Kalender optisch vollständig, aber den Alltag nicht verlässlicher. Prüft bei Änderungen, ob alte Einträge angepasst werden müssen.`,
      },
      {
        id: "uebergabe",
        title: "6. Übergaben konkret machen",
        body: `Eine gute Übergabe beantwortet: Was ist erledigt, was ist offen und wo stehen die Einzelheiten? „Kümmere dich bitte um den Brief“ lässt unnötig viel offen. Besser: „Das Formular liegt im gemeinsamen Ordner, die Unterschrift fehlt noch.“

Besprecht auch Ausnahmen. Wenn eine Person ausfällt, muss die andere die nötigen Informationen finden können. Prüft das gelegentlich mit einem unkritischen Beispiel.`,
      },
      {
        id: "vorabend",
        title: "7. Den nächsten Morgen am Vorabend entlasten",
        body: `Sucht euch eine kleine Vorbereitung aus, die morgens regelmäßig fehlt: Tasche bereitstellen, Treffpunkt klären oder die benötigten Unterlagen zusammenlegen. Es muss keine umfangreiche Abendroutine werden.

Vereinbart, wer diesen Schritt übernimmt. Falls abends keine Energie mehr da ist, vereinfacht den Schritt oder verschiebt ihn auf einen passenden Zeitpunkt. Eine Routine, die nur an idealen Tagen klappt, braucht Anpassung.`,
      },
      {
        id: "weniger-orte",
        title: "8. Weniger parallele Listen führen",
        body: `Eine Aufgabe gleichzeitig im Chat, auf einem Zettel und in einer App zu pflegen, erzeugt verschiedene Stände. Entscheidet, welcher Ort für welche Information gilt: Kalender für Termine, Aufgabenliste für offene Schritte, Ablage für Dokumente.

Verlinkt zwischen diesen Orten, wenn eure Werkzeuge das unterstützen. Ihr braucht nicht zwingend ein einziges Tool für alles. Ihr braucht eine gemeinsame Antwort auf die Frage: „Wo schaue ich nach?“`,
      },
      {
        id: "kapazitaet",
        title: "9. Nach verfügbarer Kraft verteilen",
        body: `Gleich viele Aufgaben bedeuten nicht automatisch gleich viel Aufwand. Berücksichtigt Arbeitszeiten, Wege und die Vorbereitung hinter einer Aufgabe. Sprecht darüber, was diese Woche machbar ist.

Manches darf verschoben oder gestrichen werden. Organisation kann Absprachen erleichtern, aber keine unbegrenzte Zeit schaffen. Ziel ist ein tragfähiger Alltag, kein Wettbewerb um die längste erledigte Liste.`,
      },
      {
        id: "rueckblick",
        title: "10. Eine Änderung behalten, die wirklich hilft",
        body: `Fragt nach der Testwoche: Was hat Rückfragen reduziert? Was war unnötig kompliziert? Behaltet den hilfreichen Teil und lasst den Rest weg. Ihr müsst nicht alle zehn Tipps gleichzeitig übernehmen.

Für den Papierkram kann Ordilo Briefe, bestätigte Angaben und Fragen mit Fundstellen zusammenbringen. Die App ersetzt eure Zuständigkeiten und Absprachen nicht. Startet mit einem Brief und prüft, ob beide die benötigte Information wiederfinden.`,
      },
    ],
    sources: [
      {
        title: "Ordilo: Einstieg und Funktionsumfang",
        url: "/hilfe",
        note: "Quelle für Produktangaben. Die zehn Tipps sind eigene redaktionelle Vorschläge; keine Studie, Therapieempfehlung oder garantierte Entlastung.",
      },
    ],
    related: ["wochenplan-familie", "papierkram-organisieren-familie"],
  },
];
