# Reel V2: 27 Tabs offen

## Neue gestalterische Richtung

Der Nutzer empfindet das bisherige Text-Reel als langweilig. Diese Version setzt eine kleine Alltagsszene um: warmer illustrierter Familienmoment, humorvoller Einstieg, bewegte UI-Karten, ein konkreter Lernschritt und ein gemeinsamer Abschluss. Erst diese Stilvorlage beurteilen; die bisherigen 53 Carousel-Slides sind damit noch nicht neu gestaltet.

- 0–4 s: „Mein Kopf: 27 Tabs offen. Einer spielt Flöte.“ Aufgaben springen nacheinander auf; das Kind hält eine Flöte.
- 4–8 s: Fiktiver Kita-Brief. Ausflug morgen, Rückmeldung heute. Frist wird hervorgehoben.
- 8–14 s: Gemeinsam ablegen, Frist am Original prüfen, Übernahme absprechen. Gestaffelte Karten, Tap-Indikator und gezeichnete Haken.
- 14–18 s: „Ich übernehme“ statt unklarer Bitte. Bestätigung und warmer Familienmoment.
- 18–23 s: „Weniger Denkst du dran? Mehr zusammen.“ Ordilo als Hilfe beim Papierkram, Mitmach-Frage.

Alle Aufgaben und Figuren sind erfunden. Die Karten sind eine redaktionelle Visualisierung, keine Behauptung über einen tatsächlich verfügbaren App-Bildschirm oder automatischen Versand. Kleine Footer-Kennzeichnung: Illustration · Alltagsbeispiel.

## Dateien und Produktion

`scripts/render-ordilo-reel-v2.cjs` rendert 690 einzeln komponierte Frames, 1080 × 1920, 30 fps, H.264/AAC MP4. Neben ganzen Szenen bewegen sich Karten, Haken, Tap-Indikator, Markierungen und dekorative Elemente. Die Familienillustration ist ein bewegtes statisches Asset, keine voll animierte Figur mit Lippenbewegung. Eigene synthetisierte Flötenphrase, dezente Impulse und Bestätigungstöne; keine fremde Musik, kein Voiceover. Der Inhalt bleibt ohne Ton lesbar.

Voraussetzungen: bestehende Node-Abhängigkeiten, ffmpeg, Fontconfig und lokale Figtree-Schrift. Auf macOS entwickelt. Keine neue Laufzeitabhängigkeit der Ordilo-App.

```sh
node scripts/render-ordilo-reel-v2.cjs /absolute/output
# Nur Storyboard und Stories, ohne vollständigen MP4-Render:
STILLS_ONLY=1 node scripts/render-ordilo-reel-v2.cjs /absolute/output
```

Die lokale HTML-Vorschau enthält den Videoplayer und einen echten klickbaren Beispielablauf mit Antwortfeedback und Neustart. Sie speichert oder versendet keine Daten. Reduzierte Bewegung wird für die HTML-Animation respektiert; das Video startet ausschließlich auf Nutzeraktion. Für die Vorschau den Ausgabeordner lokal bereitstellen oder `index.html` öffnen.

Zwei neue Story-PNGs lassen Platz für native Instagram-Sticker: Umfrage „Wie viele Tabs? 27 / Alle“ und Frage „Welche Aufgabe teilt ihr heute?“. Die PNGs allein sind nicht interaktiv. Sticker müssen in Instagram ergänzt werden. Das MP4 ist ein Video, keine klickbare App. Keine Veröffentlichung und keine Terminierung erfolgt.

## Illustration: Herkunft und Prompt

Asset: `docs/marketing/assets/familie-floete.png`, mit dem eingebauten `image_gen`-Tool erzeugt, transparente PNG. Original zusätzlich im generierten Bilderordner belassen. Keine Referenzbilder oder realen Personen verwendet.

Prompt:

> Use case: illustration-story. Create a beautiful original cutout illustration for Ordilo, a warm German family organization app's animated Instagram reel. Transparent background, no text, no lettering, no logo. A slightly overwhelmed but affectionate young parent with short tousled dark hair wearing an oversized muted petrol sweatshirt sits cross-legged, holding a cream paper in one hand; their small child in a peach/coral sweater leans against them playfully holding a wooden toy flute, while a second parent with curly dark hair and a soft golden ochre cardigan kneels beside them, warmly reaching toward the paper to help. Expressive tiny facial details, kind funny imperfect everyday family moment, not a corporate stock illustration. Contemporary hand-painted editorial children's-book illustration with soft gouache textures, subtle colored-pencil outlines, organic rounded silhouettes, refined restrained palette petrol #193232, warm peach #F0B4A0, butter yellow, cream, sage. Full bodies with feet and hands entirely within composition, compact triangular group centered, no background environment or ground rectangle, slight hand-painted shadow only. Crisp professional finish, warm believable gestures, three clearly distinct people, anatomically coherent hands, lots of charm. Designed to be composited as a foreground character group over a warm cream UI motion graphic. Square format.
