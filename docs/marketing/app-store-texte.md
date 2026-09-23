# App Store: Texte für Version 1.0

Stand 23.09.2026. **Vorschlag, noch nicht in App Store Connect gespeichert.**
Was aktuell gespeichert ist, steht in [app-store-listing.md](app-store-listing.md).
Das Bildkonzept dazu steht in [app-store-screenshots.md](app-store-screenshots.md).

Grundlage: 1.0 ist komplett kostenlos und werbefrei, der E-Mail-Posteingang
ist für alle Familien live. Jede Funktion unten ist im Code der App belegt.
Bewusst **nicht** behauptet werden: Terminerinnerungen per Push,
Serverstandort, „kein KI-Training“, Preise für später.

## Felder zum Einfügen

| Feld | Text | Länge |
|---|---|---|
| Name | Ordilo: Dokumente & Scanner | 27/30, unverändert |
| Untertitel | Papierkram für Familien ordnen | 30/30, unverändert |
| Keywords | `elternbrief,schule,kita,rechnung,versicherung,frist,aufgaben,familienplaner,ablage,pdf,ki,scan,post` | 99/100 |
| Werbetext | Neu und aktuell kostenlos, ohne Werbung: Briefe scannen oder per Mail weiterleiten, Ordilo fragen und die Antwort direkt im Original nachsehen. | 143/170 |
| Beschreibung | siehe unten | ca. 2.000/4.000 |

Der Werbetext lässt sich jederzeit ohne neue Prüfung ändern. Zweite Fassung,
zum Beispiel für den Schulstart oder als Wechsel nach zwei Wochen:

> Wann ist Elternabend? Bis wann kann ich kündigen? Frag Ordilo und sieh die
> Antwort direkt im Brief. Aktuell kostenlos und ohne Werbung.

## Beschreibung

```text
Wann ist der Elternabend? Bis wann kann ich den Handyvertrag kündigen? Welche Nummer steht auf der Rechnung? Frag Ordilo. Die Antwort kommt aus euren eigenen Unterlagen, mit der Stelle im Original zum Nachsehen.

Ordilo ist die Dokumenten-App für Familien. Aktuell kostenlos und ohne Werbung.

Scannen, teilen, weiterleiten
Scanne Briefe mit der iPhone-Kamera, auch viele Seiten in einem Zug. Fotos und PDFs gibst du aus jeder App über „Teilen“ an Ordilo. E-Mails mit Anhang leitest du einfach an eure Familienadresse weiter.

Ordilo liest mit
Ordilo erkennt, was wichtig ist: Termine, Fristen, Beträge und Nummern. Du schaust kurz drüber, änderst, was nicht stimmt, und bestätigst. Termine kommen mit einem Tipp in euren Familienplan.

Einfach fragen
Stell deine Frage so, wie du sie einem Menschen stellen würdest. Tippen oder einsprechen, beides geht. Ordilo antwortet in ganzen Sätzen und zeigt dir, in welchem Dokument und auf welcher Seite es steht. So musst du nicht blind vertrauen.

Alles an einem Ort
Briefe, Rechnungen, Verträge, Notizen und Kontakte liegen in eurer gemeinsamen Ablage. Die Suche findet auch Wörter im Text, nicht nur im Titel.

Zusammen statt allein
Lade deine Familie ein. Auf dem Startbildschirm seht ihr, was heute und in den nächsten Tagen ansteht. An jeder Aufgabe seht ihr, wer sich kümmert. Aufgaben, die immer wiederkommen, legt Ordilo nach dem Abhaken neu an. So hängt nicht alles an einer Person.

Eure Daten, eure Entscheidung
Ordilo fragt dich, bevor Inhalte an KI-Dienste gehen. Das kannst du in den Einstellungen jederzeit ändern. Auf Wunsch sperrst du die App mit Face ID. Wichtige Dokumente legst du als Offline-Kopie auf dein iPhone. Du kannst deine Daten exportieren und dein Konto löschen. Kein Tracking, keine Werbung.

Gut zu wissen
Ordilo nutzt KI. Prüfe wichtige Angaben, denn Fehler sind möglich. Bewahre Originale auf, wenn du sie noch brauchst. Ordilo gibt es auf Deutsch.

Fragen oder Ideen? Schreib uns an info@ordilo.de
Datenschutz: https://ordilo.de/datenschutz
```

## Was sich gegenüber der gespeicherten Fassung ändert

- **Die Beschreibung beginnt mit echten Fragen statt mit einem Slogan.** Vor
  „mehr“ zeigt der App Store nur etwa drei Zeilen. Dort muss stehen, was
  Ordilo anders macht: Antworten aus den eigenen Unterlagen, mit Fundstelle.
  Scannen können alle Scanner-Apps.
- **„Aktuell kostenlos. Ohne Werbung.“** steht in der zweiten Zeile und im
  Werbetext. Für eine neue App ohne Bewertungen ist das das stärkste
  Argument, es kostet nichts, sie auszuprobieren. „Aktuell“ hält die Tür für
  das spätere Familienabo offen. Preise gehören nicht in Name, Untertitel,
  Keywords oder Screenshots (Richtlinie 2.3.7); dort ließen sie sich außerdem
  nur mit einer neuen Version wieder ändern.
- **Neue Stärken sind drin:** Teilen aus jeder App, E-Mail-Posteingang,
  Start-Übersicht, Gesichter an Aufgaben, wiederkehrende Aufgaben, Diktat,
  Face ID, Offline-Kopien, Export, Kontolöschung und die KI-Einwilligung als
  Vertrauenspunkt.
- **„Du bist Elternteil. Keine Suchmaschine.“ entfällt.** Der Satz ist
  missverständlich und schließt Paare ohne Kinder und Großeltern aus, die
  dieselbe Post bekommen.
- **Überschriften in normaler Schreibweise statt GROSSBUCHSTABEN**, passend
  zur No-UpperCase-Regel in `DESIGN.md`. Ordilo spricht ruhig.
- **„Starte mit dem vorbereiteten Schulbrief“ entfällt.** Das Beispiel liegt
  in den Einstellungen, nicht im ersten Start. Die Beschreibung verspricht
  nur, was man beim Öffnen auch findet.

## Name, Untertitel, Keywords

Name und Untertitel bleiben. „Scanner“ und „Dokumente“ sind die stärksten
Suchwörter der Kategorie, „Papierkram“ und „Familien“ sagen, für wen die App
ist. Apple wertet Name, Untertitel und Keywords zusammen aus. Deshalb:

- Kein Wort aus Name oder Untertitel wiederholen (dokumente, scanner,
  papierkram, familien, ordnen).
- Nur Kommas, keine Leerzeichen, keine Umlaute.
- Eine Form pro Wort. Wer „Rechnungen“ sucht, findet „rechnung“ in der Regel
  trotzdem; zwei Formen verschwenden Platz.
- Suchbegriffe für konkrete Anlässe (elternbrief, kita, versicherung, frist)
  statt Technik (ocr fällt weg).
- `familienplaner` fängt Leute ab, die einen Familien-Organizer suchen. Das
  passt, weil Ordilo Aufgaben und Termine mitbringt.

Die bisherigen Doku-Stände widersprechen sich bei den Keywords
(`app-store-listing.md` und `app-store-launch-plan.md` nennen verschiedene
Listen). Vor dem Einfügen in App Store Connect prüfen, welche gerade
gespeichert ist, und danach beide Dokumente auf diese Liste angleichen.

Die Auswahl ist eine Hypothese ohne Suchvolumen-Daten. Nach dem Launch in
App Store Connect unter „Analysen“ Suchimpressionen und Conversion
beobachten und immer nur eine Sache auf einmal ändern.

## Englische Lokalisierung

Für 1.0 entfernen. Die App, die KI-Antworten und alle Benachrichtigungen
sind nur auf Deutsch. Eine englische Store-Seite verspricht eine App, die
englischsprachige Nutzer nicht lesen können, und lädt schlechte Bewertungen
ein.

## Mehrsprachigkeit: lohnt sich, ist aber kein Schalter

Mehr Sprachen vergrößern die Zielgruppe. Trivial ist es trotzdem nicht:

- Es gibt kein Übersetzungssystem. Allein die mobile App hat weit über 300
  Zeilen mit deutschem Text direkt im Code, verteilt auf fast 50 Dateien.
  Dazu kommen Web-App, Server-Fehlermeldungen, Push-Texte und E-Mails.
- Die KI ist auf Deutsch gebaut: Extraktion, Chat, Suche und der
  Qualitätsmaßstab für Antworten (`chat-quality-v1`) sind deutschsprachig
  formuliert und getestet.
- Datumsformate, Feiertage und typische Dokumentarten (Elternbrief,
  Kfz-Steuer, Krankenkasse) sind auf Deutschland zugeschnitten.

Grobe Einschätzung: mehrere Wochen für eine saubere zweite Sprache,
einschließlich neuer Tests für KI-Antworten. Deshalb nicht vor dem Launch.

Die spannendste zweite Zielgruppe ist nicht „USA“, sondern **Menschen in
Deutschland, die schlecht Deutsch lesen**: Zugezogene, internationale
Familien, Fachkräfte. Sie bekommen dieselben deutschen Briefe und haben das
größte Problem damit. Ordilo könnte deutsche Briefe lesen und auf Englisch,
Türkisch, Arabisch oder Ukrainisch erklären. Das wäre ein echter
Unterschied zu jeder Scanner-App und ein guter Kandidat für ein Update nach
dem Launch.
