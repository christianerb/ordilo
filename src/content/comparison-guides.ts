import type { Guide } from "./guides";

/**
 * Fair comparison guides. Rules: compare categories, not named competitor
 * feature lists; state only generic, well-known facts about other products
 * and link the vendor's own documentation where a specific claim is made.
 * Ordilo facts must match /hilfe, /#preise and /datenschutz.
 */
export const comparisonGuides: Guide[] = [
  {
    slug: "dokumenten-app-familie-vergleich",
    title: "Dokumenten-App für Familien: welche Lösung passt?",
    description:
      "Papierordner, Cloud-Ordner, Scanner-App, paperless-ngx, KI-Chat oder Familien-App: ein fairer Vergleich für Familien. Mit Tabelle und ehrlichen Grenzen.",
    topic: "Lösungen vergleichen",
    updated: "2026-10-22",
    answer:
      "Welche Dokumenten-Lösung zu eurer Familie passt, hängt von drei Fragen ab: Wie viel Post bekommt ihr, wer muss mitlesen können und wollt ihr Fragen an eure Unterlagen stellen? Für wenig Post reicht oft ein Papierordner. Ein Cloud-Ordner passt, wenn ihr vor allem PDFs ablegt. Eine Familien-App wie Ordilo lohnt sich, wenn ihr gemeinsam scannt, Fristen im Blick behalten und Antworten mit Fundstelle finden wollt.",
    sections: [
      {
        id: "ueberblick",
        title: "Welche Arten von Lösungen gibt es?",
        body: `In diesem Vergleich geht es um **Arten von Lösungen**, nicht um einzelne Marken. Funktionen und Preise einzelner Anbieter ändern sich oft. Prüfe sie deshalb immer auf der Seite des Anbieters.

- **Papierordner:** Briefe kommen in Ordner mit Registern. Kein Konto, keine Technik.
- **Cloud-Ordner** wie iCloud Drive, Google Drive oder Dropbox: Dateien liegen online und lassen sich mit anderen teilen.
- **Scanner-Apps:** Sie machen aus einem Foto ein sauberes PDF. Was danach passiert, ist je nach App sehr unterschiedlich.
- **Selbst gehostete Dokumentenverwaltung** wie [paperless-ngx](https://docs.paperless-ngx.com/): eine freie Software, die du auf einem eigenen Server oder Heimgerät betreibst.
- **Allgemeine KI-Chats** wie ChatGPT: Du lädst eine Datei hoch und stellst Fragen dazu.
- **Familien-Dokumenten-App** wie Ordilo: ein gemeinsamer Bereich für die Familie mit Scan, erkannten Angaben, Aufgaben und Fragen an alle Unterlagen.

Ordilo ist eine dieser Lösungen und der Herausgeber dieses Ratgebers. Wir sagen deshalb auch, wann Ordilo nicht die beste Wahl ist.`,
      },
      {
        id: "tabelle",
        title: "Der Vergleich in zwei Tabellen",
        body: `Die Tabellen zeigen typische Stärken jeder Art. Einzelne Produkte können mehr oder weniger können. „Teils“ heißt: hängt vom Anbieter, Tarif oder deiner Einrichtung ab.

| Lösung | Gemeinsamer Zugriff | Texterkennung und Suche | Fragen an Unterlagen | Fristen |
| --- | --- | --- | --- | --- |
| Papierordner | Nur am selben Ort | Nein, nur Blättern | Nein | Selbst notieren |
| Cloud-Ordner | Ja, über Freigaben | Teils, je nach Anbieter | Teils, je nach Anbieter und Tarif | Selbst im Kalender |
| Scanner-App | Teils, oft per Export | Teils | Teils | Meist selbst |
| paperless-ngx | Ja, mit Benutzerkonten | Ja, Texterkennung und Volltextsuche | Nicht im Kern | Selbst lösen |
| KI-Chat | Meist persönlich | Liest hochgeladene Dateien | Ja, zu den hochgeladenen Dateien | Teils |
| Ordilo | Ja, Familienbereich mit Einladung | Ja | Ja, über alle abgelegten Unterlagen, mit Fundstelle | Aufgaben mit Erinnerung |

| Lösung | Datenschutz und Ort der Verarbeitung | Aufwand | Kosten |
| --- | --- | --- | --- |
| Papierordner | Bleibt bei euch zu Hause | Ablegen von Hand, kein Einrichten | Ordner und Register |
| Cloud-Ordner | Beim Cloud-Anbieter; Ort je nach Anbieter | Ordner und Dateinamen selbst pflegen | Oft Gratis-Speicher, mehr gegen Gebühr |
| Scanner-App | Je nach App auf dem Gerät oder online | Gering beim Scannen, Ablage selbst | Oft Gratis-Version, mehr gegen Gebühr |
| paperless-ngx | Auf deinem eigenen Server | Hoch: Einrichten, Updates, Sicherung | Software frei, dazu Gerät und Zeit |
| KI-Chat | Beim KI-Anbieter; Einstellungen prüfen | Gering für eine Frage, hoch für ein dauerhaftes Archiv | Gratis-Version und Abos |
| Ordilo | Speicher in der EU; KI-Analyse über OpenAI und Datalab nach Einwilligung, auch in den USA | Gering: scannen, Angaben prüfen | Scannen und Fragen kostenlos; Plus 7,99 € im Monat oder 79,99 € im Jahr |

Die Einschätzungen zu fremden Lösungen sind allgemein gehalten. Sie sind kein Test einzelner Produkte.`,
      },
      {
        id: "wann-was",
        title: "Welche Lösung passt zu welcher Familie?",
        body: `**Papierordner** passen, wenn ihr wenig Post bekommt, alle am selben Ort wohnt und niemand unterwegs nachsehen muss. Das ist günstig und ohne Datenweitergabe.

**Ein Cloud-Ordner** passt, wenn ihr schon einen Anbieter nutzt, vor allem PDFs bekommt und gern selbst Ordner und Dateinamen pflegt. Eine gute [Ordnerstruktur](/ratgeber/ordnerstruktur-private-dokumente) ist hier wichtiger als jede App.

**Eine Scanner-App** passt, wenn du vor allem saubere PDFs brauchst. Auf dem iPhone geht das oft schon ohne Zusatz-App, siehe unsere [Scan-Anleitung](/ratgeber/dokumente-scannen-iphone).

**paperless-ngx** passt, wenn jemand in der Familie gern Technik betreut und die Unterlagen auf dem eigenen Server bleiben sollen. Dafür seid ihr selbst für Updates und Sicherungen zuständig.

**Ein KI-Chat** passt für eine einzelne Frage zu einem Dokument, etwa „Was steht in diesem Brief?“. Für ein gemeinsames Archiv ist er nicht gebaut. Mehr dazu im Vergleich [Ordilo oder ChatGPT](/ratgeber/ordilo-oder-chatgpt-dokumente).

**Ordilo** passt, wenn mehrere Personen Briefe scannen, Fristen teilen und später Fragen an alle Unterlagen stellen wollen, ohne selbst Technik zu betreuen.`,
      },
      {
        id: "nicht-ordilo",
        title: "Wann ist Ordilo nicht die beste Wahl?",
        body: `Wir sagen das offen, weil es dir Zeit spart:

- **Du willst keine KI-Verarbeitung.** Ordilo nutzt für Texterkennung und Antworten die Dienste OpenAI und Datalab. Ohne deine Einwilligung bleiben Scannen, Fragen und Spracheingabe aus. Dann sind Papierordner, ein Cloud-Ordner oder paperless-ngx passender.
- **Alles soll auf deinem eigenen Gerät bleiben.** Ordilo speichert in der EU, aber nicht bei dir zu Hause. Wer das will, ist mit einer selbst gehosteten Lösung besser bedient.
- **Ihr bekommt kaum Post.** Für ein paar Briefe im Jahr lohnt sich kein neues System.
- **Ihr nutzt nur Android-Handys.** Ordilo gibt es als iPhone-App und im Browser. Eine eigene Android-App gibt es noch nicht.
- **Du brauchst Firmen-Funktionen** wie Rechnungs-Workflows oder Buchhaltung. Ordilo ist für Familien gedacht, nicht für Betriebe.

Auch mit Ordilo gilt: Eine KI-Antwort kann falsch sein. Öffne die Fundstelle und prüfe wichtige Beträge und Termine im Original.`,
      },
      {
        id: "entscheiden",
        title: "So entscheidet ihr in 15 Minuten",
        body: `Nehmt drei echte Briefe aus den letzten Wochen, etwa einen Kita-Brief, eine Rechnung und ein Schreiben mit Frist. Probiert damit die Lösung aus, die euch am meisten anspricht.

1. Kann die zweite Person den Brief ohne Hilfe öffnen?
2. Findet ihr eine Nummer oder ein Datum per Suche oder Frage wieder?
3. Ist klar, wer sich um die Frist kümmert?
4. Wisst ihr, wo die Daten liegen und wie ihr sie wieder herausbekommt?

Wenn eine Lösung bei Frage 1 oder 2 scheitert, ist sie für eure Familie wahrscheinlich die falsche, egal wie gut sie klingt. Wie ihr danach euren Papierkram gemeinsam organisiert, zeigt die [Familienablage-Checkliste](/ratgeber/papierkram-organisieren-familie).`,
      },
    ],
    sources: [
      {
        title: "paperless-ngx: offizielle Dokumentation",
        url: "https://docs.paperless-ngx.com/",
        note: "Primärquelle für paperless-ngx als selbst gehostete Software mit Texterkennung und Volltextsuche. Inhalt am 22. Oktober 2026 über eine Websuche bestätigt; die Seite selbst war aus unserer Arbeitsumgebung nicht direkt abrufbar.",
      },
      {
        title: "OpenAI Hilfe: Datei-Uploads in ChatGPT",
        url: "https://help.openai.com/en/articles/8555545-file-uploads-faq",
        note: "Primärquelle dafür, dass ChatGPT hochgeladene Dateien wie PDFs auswerten kann. Grenzen hängen laut OpenAI vom Tarif ab.",
      },
      {
        title: "Ordilo: Funktionen und Preise",
        url: "/hilfe",
        note: "Quelle für Gratisfunktionen, Ordilo Plus und Preise in Deutschland.",
      },
      {
        title: "Ordilo: Datenschutz",
        url: "/datenschutz",
        note: "Quelle für Speicherort, Einwilligung und KI-Dienstleister. Die Einschätzungen zu anderen Lösungen sind eine allgemeine redaktionelle Einordnung, kein Produkttest.",
      },
    ],
    related: [
      "ordilo-oder-chatgpt-dokumente",
      "ordnerstruktur-private-dokumente",
      "papierkram-organisieren-familie",
    ],
  },
  {
    slug: "ordilo-oder-chatgpt-dokumente",
    title: "Ordilo oder ChatGPT für eigene Dokumente?",
    description:
      "ChatGPT kann hochgeladene Dateien lesen. Was macht Ordilo anders? Ein fairer Vergleich: Familienarchiv, geprüfte Angaben, Erinnerungen und Datenschutz.",
    topic: "Lösungen vergleichen",
    updated: "2026-10-22",
    answer:
      "ChatGPT kann hochgeladene Dokumente lesen und Fragen dazu beantworten. Für eine einzelne Frage zu einem Brief reicht das oft. Ordilo ist für etwas anderes gebaut: ein dauerhaftes, gemeinsames Familienarchiv mit geprüften Angaben, Aufgaben mit Erinnerung und Antworten mit Fundstelle über alle abgelegten Unterlagen. Beide nutzen KI-Modelle von OpenAI; Ordilo erst nach deiner Einwilligung.",
    sections: [
      {
        id: "was-chatgpt-kann",
        title: "Was kann ChatGPT mit Dokumenten?",
        body: `ChatGPT ist ein allgemeiner KI-Assistent. Laut [OpenAI-Hilfe](https://help.openai.com/en/articles/8555545-file-uploads-faq) kannst du Dateien wie PDFs hochladen und Fragen dazu stellen. Wie viele Dateien und wie lange sie verfügbar sind, hängt vom Tarif ab.

Das ist praktisch, wenn du schnell wissen willst, was in einem Schreiben steht. Zum Beispiel: „Erklär mir diesen Brief in einfachen Worten.“ Oder: „Welche Frist steht in diesem Schreiben?“ Dafür brauchst du kein eigenes System.

ChatGPT kann außerdem viel mehr als Dokumente: Texte schreiben, Ideen sammeln, Fragen zu ganz anderen Themen beantworten. Ordilo kann das nicht und will es auch nicht.`,
      },
      {
        id: "unterschiede",
        title: "Was ist bei Ordilo anders?",
        body: `Der Unterschied liegt nicht darin, ob eine KI einen Brief lesen kann. Er liegt darin, was danach mit dem Brief passiert.

| Frage | ChatGPT | Ordilo |
| --- | --- | --- |
| Wofür gebaut? | Allgemeiner Assistent für viele Aufgaben | Ablage für Familienunterlagen |
| Wer sieht die Unterlagen? | Vor allem als persönliches Konto gedacht | Gemeinsamer Familienbereich, Mitglieder per Einladung |
| Was bleibt gespeichert? | Chats und Dateien in deinem Konto, je nach Einstellung und Tarif | Jedes Dokument dauerhaft im Familienarchiv, bis ihr es löscht |
| Erkannte Angaben | Stehen im Chat-Text | Werden als Felder vorgeschlagen, du prüfst und bestätigst sie |
| Fristen | Je nach Funktionen und Tarif | Aufgaben aus bestätigten Fristen, mit Erinnerung |
| Fragen über viele Dokumente | Zu den Dateien im Chat oder Projekt | Über alle abgelegten Unterlagen der Familie |
| Beleg zur Antwort | Je nach Antwort | Fundstelle zum Nachsehen im Original |

Kurz gesagt: ChatGPT ist gut für die Frage zu einem Brief. Ordilo ist für den Ordner gebaut, in dem alle Briefe der Familie liegen und den beide Eltern nutzen.`,
      },
      {
        id: "datenschutz",
        title: "Und der Datenschutz?",
        body: `Hier wollen wir genau sein, denn der Unterschied ist kleiner, als viele denken.

**Ordilo nutzt ebenfalls OpenAI.** Für die Analyse von Dokumenten und für Antworten sendet Ordilo Inhalte an die OpenAI-API. Für die Texterkennung gescannter Seiten nutzen wir Datalab. Beide Dienste sitzen in den USA. Dabei können Daten in die USA übermittelt werden; abgesichert ist das über Standardvertragsklauseln der EU-Kommission.

**Ordilo fragt vorher.** Bevor Inhalte zum ersten Mal an OpenAI oder Datalab gehen, fragt Ordilo dich ausdrücklich. Ohne Zustimmung bleiben Scannen, Fragen und Spracheingabe aus. Ablage, Aufgaben, Termine und Familie funktionieren weiter.

**Speicherort und Training.** Deine Dokumente und Kontodaten speichert Ordilo auf Servern in der EU. Über die OpenAI-API übermittelte Inhalte werden dort laut unserer [Datenschutzerklärung](/datenschutz) nicht zum Training verwendet.

Bei ChatGPT legst du selbst in den Einstellungen fest, ob deine Chats zur Verbesserung der Modelle genutzt werden dürfen. OpenAI erklärt das in den [Hinweisen zu Datenkontrollen](https://help.openai.com/en/articles/7730893-data-controls-faq). Prüfe die Einstellung, bevor du private Unterlagen hochlädst.`,
      },
      {
        id: "wann-chatgpt",
        title: "Wann ist ChatGPT die bessere Wahl?",
        body: `- Du hast **eine einzelne Frage** zu einem Brief und willst ihn nicht dauerhaft ablegen.
- Du brauchst Hilfe beim **Schreiben einer Antwort**, etwa an eine Behörde oder einen Vermieter.
- Du nutzt ChatGPT ohnehin täglich und brauchst **kein gemeinsames Archiv** mit anderen.

Und wann passt Ordilo besser?

- Ihr seid **zu zweit oder mehr** und wollt dieselben Unterlagen sehen.
- Ihr wollt Briefe **einmal scannen** und später Fragen stellen, ohne sie wieder hochzuladen.
- Ihr wollt Fristen als **Aufgaben mit Erinnerung** und eine **Fundstelle** zu jeder Antwort.

Ihr könnt auch beides nutzen. Gleich ist aber bei beiden: Eine KI-Antwort kann falsch sein. Prüfe Beträge und Fristen im Original.`,
      },
      {
        id: "ausprobieren",
        title: "So probierst du den Unterschied selbst aus",
        body: `Nimm einen unkritischen Brief mit einer Frist, zum Beispiel einen Elternbrief. Stelle in beiden Werkzeugen dieselbe Frage: „Bis wann muss ich das abgeben?“

Warte dann eine Woche und frage noch einmal, ohne den Brief neu hochzuladen. Bitte außerdem deine Partnerin oder deinen Partner, dieselbe Frage zu stellen. Genau hier zeigt sich, ob du eher einen Assistenten für einzelne Fragen oder ein gemeinsames Archiv brauchst.

Scannen und Fragen sind in Ordilo kostenlos. Nur das Live-Gespräch gehört zu Ordilo Plus. Einen breiteren Überblick über alle Lösungen findest du im [Vergleich für Familien](/ratgeber/dokumenten-app-familie-vergleich).`,
      },
    ],
    sources: [
      {
        title: "OpenAI Hilfe: Datei-Uploads in ChatGPT",
        url: "https://help.openai.com/en/articles/8555545-file-uploads-faq",
        note: "Primärquelle für Datei-Uploads, Tarifgrenzen und Aufbewahrung in ChatGPT. Inhalt am 22. Oktober 2026 über eine Websuche geprüft; Funktionen ändern sich häufig.",
      },
      {
        title: "OpenAI Hilfe: Datenkontrollen in ChatGPT",
        url: "https://help.openai.com/en/articles/7730893-data-controls-faq",
        note: "Primärquelle für die Einstellung, ob Chats zur Modellverbesserung genutzt werden.",
      },
      {
        title: "Ordilo: Datenschutz",
        url: "/datenschutz",
        note: "Quelle für Einwilligung, Speicherort in der EU, Dienstleister OpenAI und Datalab sowie die Übermittlung in die USA.",
      },
      {
        title: "Ordilo Hilfe",
        url: "/hilfe",
        note: "Quelle für Gratisfunktionen und Ordilo Plus. Die Gegenüberstellung ist eine redaktionelle Einordnung von Ordilo, kein unabhängiger Test.",
      },
    ],
    related: [
      "dokumenten-app-familie-vergleich",
      "dokumente-scannen-iphone",
      "kita-schulbriefe-organisieren",
    ],
  },
];
