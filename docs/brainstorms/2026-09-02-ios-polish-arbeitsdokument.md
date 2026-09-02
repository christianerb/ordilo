# iOS-Politur: Arbeitsdokument

Internes Arbeitsdokument für die Überarbeitung der nativen App
(`apps/mobile`). Es hält fest, was da ist, was sich ändert und warum.
Es ist kein Freigabedokument.

## 1. Produktkarte (Stand vor der Überarbeitung)

| Bereich | Route | Was es tut |
| --- | --- | --- |
| Einstieg / Login | `(auth)/einstieg`, `(auth)/login` | Produktstory, E-Mail-Code-Login |
| Onboarding | `onboarding`, `willkommen` | Familie + Personen anlegen; Intro für Eingeladene |
| Start („Heute") | `(tabs)/index` | Begrüßung, Prioritätskarte, Heute, Demnächst, Dokumente, Als Nächstes, E-Mail-Funde |
| Dokumente („Ablage") | `(tabs)/ablage` | Dokumente / Notizen / Kontakte, Suche, Status-Chips, Art, Sortierung |
| Dock-Mitte | Ordilo-Marke | Sheet mit „Frage Ordilo" und „Dokument scannen" (zwei Taps bis zur Kamera) |
| Termine („Plan") | `(tabs)/plan` | Aufgaben (Jetzt / Als Nächstes / Ohne Termin / Erledigt) und Kalender |
| Familie | `(tabs)/familie` | Mitglieder, Einladung, Abmelden |
| Ordilo fragen | `suche` (Stack) | Chat mit Streaming, Quellen, Aktionen, Sprache; kein Verlauf |
| Scan | `scan` (transparentes Modal) | VisionKit-Scanner, Fotos, Datei, Warteschlange, Verarbeitung |
| Dokument | `document/[id]` | Übersicht, Prüfen/Bearbeiten, Original, Löschen |
| Notiz / Kontakte / Sammlungen | `note/[id]`, `contacts/*`, `sammlungen/*` | Detail- und Listenscreens |
| Einstellungen | `einstellungen` | Sperre, Mitteilungen, Rechtliches, Konto |

## 2. Wichtigste Nutzerwege

1. Brief kommt an → App öffnen → scannen → Ordilo liest → prüfen → abgelegt →
   Termin/Aufgabe entstehen.
2. Kurzer Blick im Flur: Was ist heute dran? Wer muss was? Ist etwas neu?
3. Frage stellen: „Wann ist Emmas Zahnarzttermin?", „Wo ist die letzte
   Stromrechnung?" → Antwort mit Quelle → Dokument öffnen.
4. Aufgabe abhaken / verschieben / jemandem geben.
5. Familie einladen, Person umbenennen, Sicherheit einstellen.

## 3. Prinzipien für diese Überarbeitung

- **Erst die Konsequenz, dann das Dokument.** Termine, Aufgaben, Beträge
  und Personen stehen vor Datei, Format und Status.
- **Menschen statt Metadaten.** Wer betroffen ist, steht als Gesicht auf
  der Zeile: Aufgabe, Termin, Dokument. Nie als Formularfeld erzwingen.
- **Eine große Überschrift, keine Widget-Kacheln.** Ruhige, große Titel
  wie in iOS-Apps; Karten nur, wo sie gruppieren.
- **Ein Tap zur Kamera.** Die wichtigste Eingabe darf keine Zwischenfrage
  haben.
- **Ordilo ist ein Ort, kein Modal.** Der Chat behält seinen Zustand, hat
  Verlauf und Vorschläge, die die Familie kennen.
- **Zustände gehören zum Produkt.** Leer, ein Eintrag, viele, Laden,
  Fehler, offline, sehr lange Texte.
- **Bestehende Datenverträge respektieren.** Nur Supabase-Reads unter RLS
  und die vorhandenen API-Routen; keine neuen Migrationen nötig.

## 4. Entscheidungen mit größter Wirkung

1. **Neue Dock-Struktur:** Start · Dokumente · **Scannen** (Mitte, ein
   Tap öffnet direkt den Scanner) · Plan · **Ordilo** (Chat als echter Tab
   mit Verlauf). Familie wird ein Stack-Screen, erreichbar über die
   Familien-Avatare im Start-Header und aus dem Plan. Begründung: Scannen
   und Fragen sind die zwei täglichen Aktionen; die Mitgliederliste ist
   selten nötig, die Familie selbst aber überall sichtbar (Gesichter auf
   Zeilen).
2. **Start als Briefing:** eine Antwort auf „Was ist jetzt wichtig?" (überfällig,
   heute, neues Dokument prüfen oder „alles gut"), dann Heute, Demnächst
   (echte Liste der nächsten 7 Tage), Neu dazugekommen, Als Nächstes.
3. **Dokumentzeilen mit Bedeutung:** typische Icons je Dokumentart,
   Personen-Chips aus den erkannten Personen, klarer „Neu"-Zustand.
4. **Dokument-Detail versteht zuerst:** Titel, Zusammenfassung, Personen,
   „Was das bedeutet" (Termine, Aufgaben, Beträge) mit Kalender-Option
   beim Bestätigen; Datei-Details bleiben verfügbar, aber zweitrangig.
5. **Ordilo-Tab:** Verlauf vergangener Gespräche (RLS-Reads auf
   `chat_conversations`/`chat_messages`), Vorschläge mit echten Namen der
   Familie, ruhigere Antwort-Darstellung.
6. **Plan:** Gesicht der zuständigen Person auf jeder Aufgabe (wie im
   Web-Vertrag vorgesehen, mobil bisher weggelassen), Personenfilter.

## 5. Reihenfolge

1. Fundament: Tokens, Header, Personen-Primitive, Dock/IA.
2. Start.
3. Dokumente-Liste.
4. Scan.
5. Dokument-Detail.
6. Ordilo-Tab.
7. Plan.
8. Familie/Einstellungen.
9. Tests, Typecheck, Lint, Doku.

Jeder Schritt endet mit einem Commit.

## 6. Technische Grenzen

- Kein iOS-Simulator in dieser Umgebung (Linux). Verifikation über
  Typecheck, ESLint, Jest (jest-expo) und Render-Tests; Gerätetests bleiben
  laut `plans/README.md` Pflicht vor einem Release.
- Personen an Dokumenten kommen aus `extracted_entities` (entity_type
  `person`, `linked_object_id` → `family_members.id`); nicht verknüpfte
  Namen bleiben als Text sichtbar.
- Chat-Verlauf: `chat_messages.actions` speichert nur Vorschläge; der
  Zustand einer Aktion wird beim Laden als „bereit" wiederhergestellt
  (Idempotenz über `action_id` im Server).
- Bestätigen eines Dokuments akzeptiert `calendar_events`; die App
  schickte bisher immer `[]`.
- Die Motion-Tests in `src/__tests__/motion-screens.test.ts` prüfen
  Quelltext-Strings; sie werden mit dem Design mitgeführt.
