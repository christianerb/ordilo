# Offene Ratgeber und hilfreiche Social-Serie

Stand: 21.10.2026. Ziel: Sichtbarkeit durch konkrete Hilfe und teilbare Inhalte. Alle Ratgeber sind ohne E-Mail-Wall lesbar. Keine Newsletter-Anmeldung wurde implementiert.

## Redaktioneller Umfang

- Neuer ausführlicher Guide `/ratgeber/mental-load-familie`: Begriff, fiktives Kita-Beispiel, drei Ansätze, kopierbare Übergabe-Tabelle und Wochenexperiment. Die bpb liefert die begriffliche Einordnung; Beispiele und Übungen sind eigene redaktionelle Vorschläge. Keine Wirksamkeitsversprechen.
- Neuer Artikel `/ratgeber/familienorganisation-was-tun-wenn`: sechs Alltagssituationen, jeweils mit konkretem nächsten Schritt.
- Die bestehenden Artikel zu zehn Organisationstipps, zehn Digitalisierungstipps und dem Wochenplan bleiben die passenden Ziele für diese Suchabsichten. Keine doppelten Artikel für dieselbe Suchabsicht.
- Neue Carousels: drei Mental-Load-Ansätze (5 Slides) und fünf Organisationstipps (7 Slides). Zusammen mit den drei bestehenden Carousels: 5 Pakete, 33 Slides.
- Vier eigenständig teilbare Stories: Denkarbeit, drei Gesprächsfragen, verlorener Kita-Brief, unklare Zuständigkeit.
- Animiertes Text-Reel: 6 Szenen à 4 Sekunden, 1080 × 1920, 30 fps, ohne Ton verständlich. Sanfte Bewegung und Übergänge; keine fremden Bilder oder Musik.

## Suchdaten und Priorität

Quelle: `keyword-planner-2026-10-21.csv`, Deutschland, alle Sprachen, Google, Oktober 2025 bis September 2026. `mental load`: 10.000–100.000 monatliche Suchen; `mental load reduzieren`: 10–100. Die große Begriffsabfrage ist keine Download-Prognose. Der Guide beantwortet zunächst die Begriffssuche und führt zu konkreten Alltagsabläufen. Für die sechs „Was tun, wenn“-Fragen liegt kein gemessenes Suchvolumen vor. Ihre Auswahl folgt dem Produktnutzen und den Nutzerfragen, nicht erfundenen Volumina.

## Veröffentlichungsvorschlag

1. Mental-Load-Carousel; begleitend Story über die Denkarbeit.
2. „Was tun, wenn“-Artikel; Story zum verlorenen Brief mit Link-Sticker zum veröffentlichten Artikel.
3. Reel; Story mit drei Gesprächsfragen.
4. Fünf Organisationstipps; Story zur ungeklärten Zuständigkeit.
5. Bestehendes Top-10-Carousel als weitere Folge.

Die Reihenfolge ist ein Vorschlag, keine erfolgte Planung in Metricool. Neue Artikel-Links erst nach Website-Deployment einsetzen. Ein Link-Sticker muss in Instagram hinzugefügt werden; die PNGs enthalten keine funktionierenden Sticker. Vor dem Posten Vorschau und Zuschnitt im jeweiligen Instagram-Format prüfen. Reichweite, Speichervorgänge, geteilte Beiträge, Profilaufrufe und App-Store-Klicks auswerten; keine künstlichen Zielwerte als Ergebnis ausgeben.

## Reproduzieren

```sh
node scripts/render-marketing-carousels.cjs /absolute/output/carousels
node scripts/render-marketing-stories.cjs /absolute/output/vertikal
```

Benötigt vorhandene Node-Abhängigkeiten sowie `ffmpeg` auf PATH. Quellen: `instagram-listicles.json` und `social-practical-series.json`. Exporte liegen außerhalb des Git-Repositories. Carousels enthalten Captions und Alt-Texte; Stories und Reel enthalten Textprotokolle. Keine Veröffentlichung oder Terminierung durch die Renderer.
