---
date: 2026-08-06
topic: home-screen-familienjournal
---

# Home-Screen: Das Familienjournal öffnet sich

## Was wir bauen

Der Home-Screen wird von einer Listen-Übersicht zum aufgeschlagenen Familienjournal:
oben ein persönlicher Tages-Briefing-Gruß, darunter EIN großer „Heute-Moment" (die
wichtigste Sache des Tages mit direkter Aktion), danach gruppierte Hinweise und ein
visuelles Dokumenten-Journal mit echten Scan-Thumbnails statt Datei-Icons. Redundante
Sektionen („Zum Durchsehen" / „Zuletzt gescannt") verschmelzen zu einer Journal-Sektion,
der doppelte Scan-Einstieg wird auf einen reduziert, und der Chat bekommt kontextuelle
Suggestion-Chips.

## Warum dieser Ansatz

Vier Richtungen wurden diskutiert (Heute-Hero / Journal-Thumbnails / Tages-Briefing /
Aufräumen) — Entscheidung: alle vier, als großes Konzept mit neuer Datenbasis. Der
Screen beantwortet heute „Was brennt?" nur als Liste; das Konzept macht daraus eine
Antwort in EINEM Blick: Gruß sagt es in einem Satz, Hero zeigt es als Karte, Journal
gibt Wiedererkennung über echte Scans. Der bestehende Datenfluss (alle Queries bereits
parallel in `home/page.tsx`) trägt die meisten Änderungen ohne neue Roundtrips.

## Screen-Struktur (mobil, von oben nach unten)

1. **Tages-Briefing-Gruß** — Zeile 1: „Guten Morgen, Familie Reesi". Zeile 2: EIN
   deterministisch komponierter Satz, z. B. „Heute ist der Kita-Ausflug fällig —
   außerdem warten 2 Dokumente auf dich." oder im Ruhezustand „Alles erledigt — die
   Woche sieht ruhig aus." Mitglieder-Avatare bleiben.
2. **Heute-Hero** — genau eine Karte: überfällige Aufgabe > heute fällig > morgen
   fällig > dringendster Hinweis > Ruhezustand („Alles im grünen Bereich", mit der
   Scenery-Illustration aus der Sidebar als wiederkehrendem Motiv). Eine Primäraktion
   („Als erledigt markieren" / „Dokument ansehen"), eine Sekundäraktion. Apricot nur
   im Überfällig-Fall (Apricot Scarcity Rule: der Hero ist der EINE Apricot-Träger
   des Screens, dringende Hinweise degradieren dann zu Icon-Betonung).
3. **Hinweise** — eine gruppierte Surface mit internen Dividern (DESIGN.md „Section
   grouping") statt schwebender Einzelkarten.
4. **Journal (Dokumente)** — eine Sektion „Deine Dokumente": echte Thumbnails im
   Seitenformat (ca. 3:4), Titel + relatives Datum darunter. Unbestätigte Dokumente
   sortieren vor und tragen einen Petrol-Chip „Bitte bestätigen" (ersetzt die alte
   Sektion „Zum Durchsehen"). „Alle Dokumente"-Link nach /dokumente.
5. **Als Nächstes** — bleibt (funktioniert), beginnt aber erst ab Aufgabe #2, wenn
   der Hero die #1 absorbiert hat. „Alle N Aufgaben anzeigen" bleibt.
6. **Chat** — Suggestion-Chips über dem Composer, aus den Briefing-Daten abgeleitet
   („Was steht diese Woche an?", „Zeig die Rechnung von BestPlug"). Scan-Kachel im
   Grid entfällt — der Bottom-Scan-Button ist der eine Einstieg.

## Neue Datenbasis

### A. Thumbnail-Pipeline

- Migration: `documents.thumb_path text null` (idempotent, `add column if not exists`).
- Generierung am Ende des Analyze-Jobs (`src/lib/pipeline/analyze-step.ts`), best-effort:
  - Bilder: auf ~800px Breite als WebP skalieren.
  - PDFs: Seite 1 serverseitig rendern (pdfjs/unpdf im Node-Runtime), WebP.
  - Ziel: `${familyId}/${documentId}/thumb.webp` im bestehenden `documents`-Bucket;
    danach `thumb_path` am Dokument setzen. Fehler → `thumb_path` bleibt null,
    Kachel fällt auf die heutige Icon-Variante zurück.
- Auslieferung: `home/page.tsx` batcht `createSignedUrls` für die sichtbaren Dokumente
  (Muster existiert bereits in `familie/page.tsx` für Avatare) und reicht `thumbUrl`
  in den HomeClient.
- Backfill: einmaliger Best-Effort-Lauf für Bestandsdokumente (Skript oder Admin-Route).

### B. Tages-Briefing

- Phase 1 (deterministisch, sofort): reine Compose-Funktion `lib/home-briefing.ts`
  aus bereits geladenen Daten (überfällig, heute fällig, unbestätigte Docs, Ruhezustand).
  Kein LLM, kein Halluzinationsrisiko, voll testbar — passt zur Guardrail-Kultur.
- Phase 2 (optional, LLM): Cache-Tabelle `daily_briefs (family_id, date, text,
  generated_at)`, unique auf `(family_id, date)`, idempotente Migration. Ein Generierungs-
  lauf pro Familie/Tag, Fallback auf die deterministische Variante bei Fehler.

### C. Suggestion-Chips

Aus den Briefing-Daten abgeleitet, kein neuer Speicher.

## Key Decisions

- **Ein Apricot-Träger pro View:** Der Hero trägt Apricot nur bei „überfällig";
  Hinweise verzichten in dem Fall auf Apricot-Ränder (Scarcity Rule).
- **Deterministisches Briefing vor LLM:** Regelwerk zuerst, LLM als optionale
  Aufwertung mit Tages-Cache — niemals LLM-Text ohne deterministischen Fallback.
- **Thumbnails best-effort:** Kein Blocker in der Pipeline; fehlende Thumbs zeigen
  die bestehende Icon-Kachel. Bestehende Signierte-URL-Batch-Muster werden
  wiederverwendet, keine neue Infrastruktur.
- **Journal ersetzt zwei Sektionen:** „Zum Durchsehen" wird ein Zustand (Chip +
  Sortierung) statt einer eigenen Sektion — eine Wahrheit, kein Duplikat.
- **Radien/Schatten:** Hero `rounded-ordilo-md` (20px), Kacheln `rounded-ordilo-sm`
  (12px), nur Card-Rest/Hover-Schatten, 1px Mist-Light-Border an Thumbnails.

## Phasen

1. **Phase 1 — Aufräumen + Hero + Briefing + Chips** (nur Frontend + Compose-Logik,
   keine Pipeline): Hero-Komponente mit Prioritätslogik, deterministisches Briefing,
   gruppierte Hinweise, Scan-Kachel entfernen, Chips. Tests: Briefing-Composer
   (alle Zustände), Hero-Priorität, Dedup-Logik.
2. **Phase 2 — Thumbnails + Journal** (Migration + Pipeline + Grid): `thumb_path`,
   Generierung im Analyze-Job, Signierte-URL-Batch, Journal-Kachel mit Fallback,
   Sektions-Merge. Tests: Pipeline-Schritt (Erfolg/Fehler), Kachel-Fallback,
   Migrations-Idempotenz.
3. **Phase 3 — LLM-Briefing (optional):** `daily_briefs`-Tabelle, Generierung +
   Cache + Fallback. Erst angehen, wenn Phase 1/2 live und das Briefing sich bewährt.

## Open Questions

- PDF-Rendering im Serverless-Kontext: pdfjs-dist im Node-Runtime vs. externer
  Renderer — in Phase 2 mit einem Spike klären (Bundle-Größe, Laufzeit).
- Thumbnail-Seitenformat: 3:4 (Hochformat-Brief) als Default — wie sehen Querformat-
  Scans/Fotos darin aus (cover vs. contain)?
- Ruhezustand-Hero: Scenery-Illustration aus der Sidebar wiederverwenden oder eine
  eigene, ruhigere Variante?

## Next Steps

→ Phase 1 implementieren (Feature-Branch `feature/home-today-hero`, Tests nach
AGENTS.md), danach Phase 2 als eigener Branch/PR.
