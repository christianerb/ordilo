# Listicles und Instagram-Carousels

Stand: 21.10.2026. Ergänzung zur SEO-/GEO-Strategie.

## Nachfragebasis

25 Begriffe im angemeldeten Google Keyword Planner abgefragt. Filter:
Deutschland, Google (ohne Suchnetzwerk-Partner), alle Sprachen, Oktober 2025 bis
September 2026. Die Suchbegriffe sind deutsch; der Sprachfilter ist **nicht**
„Deutsch“. Daten manuell aus der sichtbaren Tabelle transkribiert:
`keyword-planner-2026-10-21.csv`.

Google stellt für dieses Konto nur Spannen durchschnittlicher monatlicher
Suchanfragen bereit. Keine Mittelpunkte als vermeintlich exakte Werte verwenden.
„—“ bleibt leer/fehlend, nicht null Suchanfragen. Nahe Varianten können gemeinsam
erfasst sein: Werte verwandter Keywords nicht addieren. „Wettbewerb“ bezieht sich
auf Google Ads, nicht auf organische Ranking-Schwierigkeit. Der Plan ist ein
gespeicherter Rechercheentwurf; keine Kampagne gestartet, kein Budget eingerichtet.

Zuvor gefundene öffentliche Performance-Suite-Snapshots wurden durch die
kontrollierte Keyword-Planner-Abfrage als Priorisierungsbasis ersetzt. Sie sind
wegen anderer Zeiträume/Gerätefilter nicht direkt vergleichbar. Kein
Ranking- oder Installationspotenzial aus Suchvolumen allein ableiten.

## Entscheidung und Content-Zuordnung

| Priorität | Keyword / monatliche Spanne | Entscheidung | Artikel / Carousel |
| --- | --- | --- | --- |
| 1 | wochenplan familie: 1.000–10.000 | Gute Nachfrage und unmittelbare Organisationsaufgabe. Vorlage muss direkt nutzbar sein. | Neuer Artikel: 7 Schritte + kopierbare Wochentabelle. Carousel: 5 ausgewählte Kernpunkte, 7 Slides. |
| 2 | private dokumente digitalisieren: 100–1.000 | Sehr produktnah. Fokus auf Ablageablauf statt erneut iPhone-Tasten erklären. | Neuer Artikel: 10 Tipps. Carousel: alle 10 Tipps auf 7 Slides. |
| 3 | familienalltag organisieren: 10–100 | Kleineres Suchthema, aber direkt vom Nutzer gewünschtes Listicle und gut teilbar. Keine hohe SEO-Nachfrage behaupten. | Neuer Artikel: 10 Tipps. Carousel: alle 10 Tipps auf 7 Slides. |
| Bestehend | dokumente scannen iphone: 1.000–10.000 | Bestehenden Artikel behalten; keine konkurrierende zweite Scan-Anleitung. | Verlinkung aus neuem Digitalisierungsartikel. |
| Bestehend | ordnerstruktur privat: 100–1.000 | Bestehender Familienablage-Artikel beantwortet die Frage bereits. | Dorthin verlinken, kein dünnes Duplikat. |
| Später | familienkalender: 1.000–10.000; online: 100–1.000 | Kauf-/App-/Einrichtungsintention unterscheiden. Nicht als weiteres Wochenplan-Duplikat schreiben. | Eigener Vergleich erst nach Produktprüfung. |
| Später | mental load: 10.000–100.000; reduzieren: 10–100 | Der breite Begriff ist größer, aber hat eine andere, oft erklärende Suchabsicht. | Separater quellenbasierter Grundlagenartikel; keine Entlastungsgarantie durch Ordilo. |
| Zurückgestellt | haushaltsplan familie / putzplan vorlage: je 1.000–10.000 | Finanzplanung bzw. Putzvorlage ist nicht automatisch Dokumentenorganisation. | Nur bei eigenständigem Nutzen und echter Vorlage weiterverfolgen. |

Die Prioritäten verbinden Volumen, Suchintention, Produktnähe und Doppelungsrisiko.
Die drei Artikel sind eigene Organisationsvorschläge, keine „wissenschaftlich
besten“ Tipps. Zahlen im Titel zählen Tipps, nicht eine unbelegte Rangfolge.

## Dateien und Nutzung

- `src/content/listicle-guides.ts`: vollständige Artikel, statisch über das bestehende Ratgebertemplate.
- `instagram-listicles.json`: drei Carousels mit je sieben Slides, Captions und fünf relevanten Hashtags.
- `scripts/render-marketing-carousels.cjs`: reproduzierbarer PNG-Export in 1080 × 1350, Figtree und Ordilo-Farben; nutzt vorhandene Dependencies.
- Je Exportordner: `01.png` bis `07.png`, `caption.txt`, `alt-text.txt`.
- Übersicht aller 21 Slides: `uebersicht.png` im Exportverzeichnis.

Rendern aus dem Repository:

```sh
node scripts/render-marketing-carousels.cjs /absolute/output/directory
```

Carousels sind erstellt, **nicht gepostet oder terminiert**. Captions verweisen
auf den vorhandenen App-Link in der Bio; sie behaupten nicht, dass die neuen
Artikel bereits live sind. Artikel-Links erst nach Deployment ergänzen.
Keine auf Keyword-Volumen gestützte Instagram-Reichweitenprognose: Saves, Shares,
Profilaufrufe und App-Einstiege separat beobachten. Hashtags beschreiben den
Inhalt; Popularität oder Reichweitenwirkung wurde nicht gemessen.

## Vorschlag für die erste Ausspielung

1. Wochenplan: „Voller Kalender. Null Plan?“
2. Zwei Tage später Digitalisierung: „Scan_0042. Na, was war das?“
3. Weitere zwei Tage später Familienalltag: „Familie. Kein Solo-Projekt.“

Vor konkretem Scheduling vorhandene Beiträge und Account-Verbindung prüfen.
Keine pauschal beste Uhrzeit behaupten. Nach Veröffentlichung Saves/Shares pro
erreichtem Konto vergleichen; bei kleinen Fallzahlen nur Beobachtungen berichten.

## Quellen

- Google Keyword Planner, angemeldete UI, Abfrage vom 21.10.2026; sichtbare Monats-Spannen und Filter transkribiert.
- [Google: Keyword-Planer verwenden](https://support.google.com/google-ads/answer/7337243?hl=de)
- [Google Kalender: Familienkalender](https://support.google.com/calendar/answer/7157782?hl=de), für die einzige externe Funktionsbeschreibung im Wochenplan-Artikel.
