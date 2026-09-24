# App Store: Screenshots für Version 1.0

Stand 23.09.2026. Bewertung der sechs gespeicherten Bilder und Konzept für
ein neues Set. Die Texte dazu stehen in [app-store-texte.md](app-store-texte.md).

**Umgesetzt (23.09.2026):** Das neue Set liegt unter
[`app-store-assets/1.0/`](app-store-assets/1.0/), die Rohaufnahmen unter
`app-store-assets/raw/`, gebaut mit `node scripts/compose-store-screenshots.mjs`.
Abweichungen vom Konzept unten: Bild 5 zeigt den Plan („Alles, was ansteht.“),
weil Start noch keine Fristen der Woche zeigt; Bild 2 nennt Scannen, Foto,
PDF und Mail; das Maskottchen steht nur in der App-Ansicht, nicht zusätzlich
am Rand.

## Kurzfassung

- **Technisch passt alles.** Sechs Bilder, 1260 × 2736 (eine gültige
  6,9-Zoll-Größe), RGB ohne Alpha, fiktive Daten. Damit kann man einreichen.
- **Inhaltlich verschenken die Bilder viel.** Das erste Bild zeigt eine
  Illustration statt eines Ergebnisses, vier von sechs Bildern zeigen
  denselben Fakt (Klassenfahrt, 08:15 Uhr), und Bild 6 zeigt eine Oberfläche,
  die es so nicht mehr gibt.
- **Die ersten drei Bilder entscheiden.** In den Suchergebnissen zeigt der
  App Store nur sie, nebeneinander und klein. Dort muss man in zwei Sekunden
  sehen: „Ich kann meine Briefe fragen, und die Antwort stimmt.“
- **Schnelle Lösung (5 Minuten):** Reihenfolge in App Store Connect ändern.
- **Richtige Lösung (etwa ein Tag):** neues Set mit acht Motiven, siehe unten.

## Die sechs Bilder einzeln

| Bild | Was gut ist | Was nicht passt |
|---|---|---|
| 01 Papierkram rein | Starker Satz, klare Marke | Zeigt eine Scan-Illustration statt eines Ergebnisses. Scannen kann jede App, das Besondere fehlt ausgerechnet auf Platz 1. Die Treffzeit wiederholt sich in 02, 03 und 04. |
| 02 Fragen | Das stärkste Bild: echte Frage, klare Antwort, Fundstelle mit Markierung | Die große Antwort „12.10.2027 um 08:15 Uhr“ bricht unschön um („Uhr“ allein in einer Zeile). |
| 03 Fundstelle | Die Idee „Nachvollziehen statt blind vertrauen“ ist genau richtig | Zeigt denselben Satz wie 02 noch einmal. Viel leere Fläche. Das echte Original (Foto der Briefseite) wäre überzeugender als nur Text. |
| 04 Angaben | Zeigt, dass Ordilo mitliest | Dritter Auftritt der Klassenfahrt. Abgeschnittener Titel („Abfahrtsgleis Klassenfahrt E…“). Große leere Fläche. |
| 05 Ablage | Suche, Filter und Liste sind gut zu erkennen | Jedes Dokument ist „Sonstiges“, das wirkt, als würde die Einordnung nicht funktionieren. Alle drei Titel sind abgeschnitten. Alle Dokumente sind von Emma. |
| 06 Gemeinsam | Gesichter an Aufgaben, „Wer macht was“ ist ein echter Familien-Vorteil | Alte Oberfläche: den Button „Ich übernehme das“ gibt es nicht mehr. Abgeschnittener Titel („ben…“). Eine Aufgabe vom 10. Aug. wirkt veraltet. |

Dazu kommen Punkte, die alle Bilder betreffen:

- **Schrift:** Die großen Überschriften sind in Helvetica gesetzt, die App in
  Figtree. `DESIGN.md` erlaubt nur Figtree.
- **Großbuchstaben:** Die kleinen Überschriften („FRAG DEINEN PAPIERKRAM“)
  verstoßen gegen die No-UpperCase-Regel und wirken amtlich.
- **Drei verschiedene Hintergründe** (dunkles Blau, Sand, Weiß) im Wechsel.
  Nebeneinander in der Suche wirken die ersten drei wie drei verschiedene
  Apps.
- **Seitenzahlen „01“ bis „06“** helfen im Store niemandem.
- **Kein iPhone-Rahmen:** Die Ausschnitte schweben frei. Klein in der Suche
  ist schwer zu erkennen, dass es eine App-Oberfläche ist.
- **Es fehlt, was seit dem 16.09. dazugekommen ist:** Start-Übersicht
  „Heute bei euch“, Teilen aus anderen Apps, E-Mail-Posteingang,
  Familienfotos, wiederkehrende Aufgaben.
- **Das Maskottchen fehlt.** Der Elefant ist das Wärmste an der Marke und
  taucht nur als kleines Logo auf. `ordilo-character.tsx` gibt es schon.

## Schnelle Lösung, falls keine Zeit für neue Bilder ist

In App Store Connect nur die Reihenfolge ändern und ein Bild entfernen:

1. `02-fragen.png` (das Besondere zuerst)
2. `03-fundstelle.png`
3. `01-papierkram.png`
4. `05-ablage.png`
5. `06-gemeinsam.png`

`04-angaben.png` fällt weg, weil es denselben Inhalt wie 01 unten zeigt.
Bild 6 möglichst trotzdem neu aufnehmen, weil es eine alte Oberfläche zeigt.

## Neues Set: acht Motive

Jedes Motiv zeigt ein **anderes Dokument**, damit die App vielseitig wirkt:
Handyvertrag, Elternbrief, Stromrechnung, Klassenfahrt, Kita-Gebühren,
Kfz-Versicherung. Überschriften kurz, höchstens drei Zeilen.

| Nr. | Überschrift | Unterzeile | Bildschirm | Warum |
|---|---|---|---|---|
| 1 | Frag einfach. Ordilo weiß, wo es steht. | Antworten aus euren eigenen Briefen. | Ordilo fragen: „Bis wann kann ich den Handyvertrag kündigen?“ mit großer Antwort und Fundstelle. Maskottchen klein am Rand, zeigt auf die Antwort. | Das, was keine Scanner-App kann, steht zuerst. Die Frage betrifft jeden, nicht nur Eltern. |
| 2 | Rein damit. | Scannen, teilen oder per Mail weiterleiten. | Scan-Blatt mit Scannen, Fotos und PDF, dazu klein die Karte „Eure Familienadresse“ aus dem Posteingang. | Zeigt alle drei Wege in die App. Der Posteingang ist ein echter Vorteil. |
| 3 | Ordilo liest mit. | Termine, Fristen, Beträge. Du prüfst kurz, fertig. | Dokument „Elternbrief“ mit „Was das bedeutet“ und den Kalender-Schaltern. | Zeigt die Arbeit, die Ordilo abnimmt. Anderes Dokument als Bild 1. |
| 4 | Die Antwort. Und wo sie steht. | Nachsehen statt blind vertrauen. | „Die Fundstelle“ mit Originalseite und markierter Stelle. | Vertrauen. Die ersten vier Bilder erzählen jetzt die ganze Geschichte. |
| 5 | Heute bei euch. | Was heute und diese Woche ansteht. | Start mit „Heute bei euch“ und „Demnächst“, Gesichter an den Zeilen. | Zeigt, dass Ordilo jeden Tag nützt, nicht nur beim Scannen. |
| 6 | Wer macht was? Klar. | An jeder Aufgabe seht ihr, wer sich kümmert. | Plan mit Gesichtern, gestrichelter Kreis bei offener Aufgabe, darüber das Blatt „Wer macht das?“. | Familien-Vorteil. Aktuelle Oberfläche statt der alten. |
| 7 | Alles an einem Ort. | Briefe, Verträge, Notizen, Kontakte. | Dokumente mit Monatsgruppen, verschiedenen Arten (Rechnung, Schule, Versicherung, Vertrag) und Gesichtern. | Breite. Keine abgeschnittenen Titel, keine „Sonstiges“. |
| 8 | Sicher bei euch. | Face ID, Offline-Kopien, Export. Kein Tracking, keine Werbung. | Sperrbildschirm mit Face ID oder die Einstellungen mit KI-Einwilligung. Maskottchen. | Beantwortet die Frage, die sich jeder bei Familienpapieren stellt. |

Keine Preise und kein „kostenlos“ auf den Bildern: Das gehört in den Text,
und ein späteres Abo würde die Bilder sonst sofort falsch machen.

## Gestaltungsregeln für das neue Set

- **Ein Hintergrund für alle:** Warm Canvas mit zwei, drei großen, blassen
  Formen in Sage, Harbor Blue und Apricot, wie auf der Login-Seite. Eine
  Form läuft über den Rand von Bild 1 zu Bild 2 und von 2 zu 3, damit die
  drei in der Suche wie ein Panorama wirken.
- **Figtree 600** für Überschriften, Figtree 400 für Unterzeilen, beides in
  Graphit. Keine Großbuchstaben-Zeilen darüber.
- **Echtes iPhone-Umfeld:** schlichter Rahmen oder mindestens abgerundete
  Bildschirm-Ecken mit Statusleiste (9:41, voller Akku). Der Bildschirm
  füllt mindestens die Hälfte der Höhe, keine großen Leerflächen.
- **Kein abgeschnittener Text** auf den App-Ansichten. Beispieltitel so
  wählen, dass sie in eine Zeile passen.
- **Apricot nur als Markierung** in der Fundstelle, wie in der App.
- **Gesichter:** Initialen in den Farben der App oder Fotos, für die wir die
  Rechte haben. Keine echten Fotos aus der Familie.
- **„Echte App-Ansichten · Fiktive Beispieldaten“** klein unten stehen
  lassen, Seitenzahlen weglassen.
- **Probe in klein:** Jedes Bild auf etwa 230 Pixel Breite verkleinern. Ist
  die Überschrift dann noch lesbar und die Idee erkennbar? Sonst kürzen.

## So entstehen die Bilder

1. **Beispielfamilie anlegen.** Eigenes Konto nur für Screenshots, mit
   selbst erstellten Beispiel-PDFs (Handyvertrag, Elternbrief, Stromrechnung,
   Klassenfahrt, Kita-Gebühren, Kfz-Versicherung). Nichts Echtes, nichts aus
   dem Simulator mit privaten Daten. Aufgaben und Termine relativ zum
   Aufnahmetag, damit nichts veraltet wirkt.
2. **Im iOS-Simulator aufnehmen** (größtes aktuelles iPhone), weil Ordilo
   fragen und die Fundstelle die echte API brauchen. Statusleiste vorher
   festlegen:
   `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4`,
   dann `xcrun simctl io booted screenshot <datei>.png`.
   Für schnelle Proben der übrigen Bildschirme geht auch die Web-Vorschau
   (`ORDILO_PREVIEW=1`, siehe `apps/mobile/TESTING.md`); die finalen Bilder
   kommen aus dem Simulator.
3. **Zusammensetzen** mit einer HTML-Vorlage (Figtree, Hintergrund, Rahmen,
   Überschrift) und als 1320 × 2868 oder 1260 × 2736 exportieren. Vor dem
   Hochladen prüfen: PNG oder JPEG, RGB, kein Alpha-Kanal.
4. **Hochladen** nur für 6,9 Zoll. App Store Connect verkleinert für die
   anderen iPhones. Die Dateien wie bisher unter `app-store-assets/` ablegen.

## Später, nach dem Launch

- **App-Vorschauvideo (15 bis 30 Sekunden):** Ein Video ersetzt in der Suche
  das erste Bild und startet von selbst. Eine erste Fassung liegt als
  `app-store-assets/1.0/app-preview.mp4` bereit (Frage → Antwort →
  Fundstelle → Plan → Dokumente, 28,9 s). Scannen fehlt, weil der Simulator
  keine Kamera hat; eine Fassung mit echtem Scan braucht ein Gerät.
- **Produktseiten-Test:** In App Store Connect zwei Reihenfolgen gegeneinander
  testen, zum Beispiel „Fragen zuerst“ gegen „Scannen zuerst“. Erst sinnvoll,
  wenn genug Besucher kommen.
- **App-Icon:** Das Icon ist eigenständig und passt zur Marke. Klein auf dem
  Homescreen ist der Elefant aber schwer zu erkennen: Das Ohr wirkt wie eine
  runde Scheibe, der Rüssel ist nur ein kurzer Stummel am Rand des Sechsecks.
  `DESIGN.md` verlangt, dass Ohr, Auge und Rüssel auch klein erkennbar sind.
  Für 1.0 kein Hindernis. Ein neues Icon braucht einen neuen Build, also
  Kandidat für das erste Update.
