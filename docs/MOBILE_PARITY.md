# Mobile-Paritäts-Matrix

Die Web-App in `src/` bleibt die fachliche Referenz. Diese Matrix erfasst
jede Endnutzer-Funktion, ihren nativen Ersatz und die Nachweise für iOS.
`✅` bedeutet implementiert und lokal geprüft. `🟡` bedeutet teilweise
implementiert. `⬜` bedeutet noch offen. Kein Bereich gilt als fertig, solange
eine seiner Zeilen offen ist.

| Agent | Bereich | Web-Funktion | iOS-Screen | API/DB | Unit-Test | E2E | Real-iPhone | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D | Fundament | Session, SecureStore, App-Gate | Root, Login | Supabase Auth/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| D | Onboarding | Familie erstellen, Welcome | Onboarding, Willkommen | Supabase RPC/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| D | Einladungen | Link, Annahme, Merge | Invite-Route | RPC/API | ✅ | ⬜ | ⬜ | 🟡 |
| D | Heute | Prioritäten, Aufgaben, Hinweise | Heute | Supabase/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| D | Scan & Import | Kamera, Bilder, Dateien, Mehrseiten, Queue | Scan | Upload, OCR, Analyse | ✅ | ⬜ | ⬜ | 🟡 |
| D | Review | Analyse, Korrekturen, Original, Bestätigung | Dokument-Review | Analyse/Confirm API | ✅ | ⬜ | ⬜ | 🟡 |
| A | Ablage | Dokumentliste, Suche, Statusfilter | Ablage | Supabase/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| A | Ablage | Sortierung und serverseitige Pagination | Ablage | Supabase/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| A | Ablage | Details, Original, Metadaten | Dokument-Detail | File API/Supabase | ✅ | ⬜ | ⬜ | 🟡 |
| A | Ablage | Credentials/Secrets sicher anzeigen | Dokument-Detail | Secret API | ✅ | ⬜ | ⬜ | 🟡 |
| A | Ablage | Dokument löschen, Bestätigung, Fehlerzustand | Dokument-Detail | Delete API | ✅ | ⬜ | ⬜ | 🟡 |
| A | Notizen | Liste, erstellen, bearbeiten, löschen | Ablage/Notizen | Notes API/Supabase | ✅ | ⬜ | ⬜ | 🟡 |
| B | Kontakte | Liste, erstellen, bearbeiten, Aktionen | Ablage/Kontakte | Supabase/API | ✅ | ⬜ | ⬜ | 🟡 |
| C | Sammlungen | Liste, erstellen, bearbeiten, Beziehungen | Sammlungen | Supabase/API | ✅ | ⬜ | ⬜ | 🟡 |
| B | Ordilo fragen | Suche, Chat, Streaming, Quellen, Feedback | Suche | Search/Chat API | ✅ | ⬜ | ⬜ | 🟡 |
| B | Ordilo fragen | KI-Aktionen, Bestätigen/Anpassen/Verwerfen/Undo | Suche | Actions API | ✅ | ⬜ | ⬜ | 🟡 |
| C | Familienplaner | Aufgaben, Zuständigkeiten, Fälligkeiten, Undo | Plan | Supabase/RPC | ✅ | ⬜ | ⬜ | 🟡 |
| C | Familienplaner | Kalender, Wiederholungen, Konflikte, Vorschläge | Plan | Supabase/RPC | ⬜ | ⬜ | ⬜ | ⬜ |
| C | Familie | Mitglieder, Profile, Fotos, Beziehungen, Timeline | Familie | Supabase/API | 🟡 | ⬜ | ⬜ | 🟡 |
| C | Familie | Einstellungen, Inbound-Adresse, Kalenderfeed | Familie/Einstellungen | API/Supabase | ⬜ | ⬜ | ⬜ | ⬜ |
| D | Datenschutz | Rechtliches, Konto-/Familien-Löschung | Einstellungen | API/Supabase | ✅ | ⬜ | ⬜ | 🟡 |
| D | Qualitätslayer | Deep Links, Share, Push, Privacy-Overlay, Biometrie | App-weit | Native APIs | ✅ | ⬜ | ⬜ | 🟡 |

## Agenten-Aufteilung und Übergaben

Jeder Agent arbeitet auf einem eigenen Branch oder Worktree. Er verändert nur
die ihm zugewiesenen Bereiche, hält die Matrix aktuell und öffnet einen
kleinen, fokussierten PR. Gemeinsame Verträge (`src/lib/schemas/`, API-Routen,
Supabase-Migrationen, `apps/mobile/app/_layout.tsx`) werden vor Änderungen
mit Agent D abgestimmt. So bleiben parallele Arbeiten zusammenführbar.

### Agent A — Ablage und Notizen

- **Besitzt:** `apps/mobile/app/(tabs)/ablage.tsx`, Notiz-Routen,
  `apps/mobile/src/lib/library.ts`, `apps/mobile/src/lib/notes.ts` und ihre
  Tests.
- **Nächster Check:** Dokument-Ablage auf echtem iPhone prüfen, dann Notizen
  mit Erstellen, Bearbeiten, Löschen und Suche vollständig schließen.
- **Darf nicht eigenständig ändern:** gemeinsame Navigation, Kontakte,
  Sammlungen, Chat oder Datenbank-Schema.

### Agent B — Kontakte und Ordilo fragen

- **Besitzt:** Kontakte- und Suche-Routen, deren mobile Bibliotheken,
  Komponenten und Tests.
- **Reihenfolge:** zuerst Kontakte inklusive Telefon/E-Mail/WhatsApp und
  Quellen, danach Suche/Chat inklusive Streaming, Quellen und bestätigter
  KI-Aktionen.
- **Übergabe:** neue API-Anforderungen zuerst als klar abgegrenzten
  Vertrags-PR an Agent D.

### Agent C — Sammlungen, Planer und Familie

- **Besitzt:** Sammlungen-, Planer- und Familien-Routen sowie deren mobile
  Bibliotheken und Tests.
- **Reihenfolge:** Sammlungen, dann Aufgaben/Planer, danach Profile und
  Einstellungen.
- **Regel:** Touch-Interaktionen haben immer einen sichtbaren Gegenpart;
  keine destruktiven Swipe-Aktionen.

### Agent D — Plattform, Integration und Qualität

- **Besitzt:** App-Shell, Deep Links, Push, Share, Privacy-/Biometrieschutz,
  Datenschutz, E2E, Geräte-Smoke-Tests und die Paritäts-Matrix.
- **Aufgabe:** API-/Schema-Abstimmung, Merge-Konflikte vermeiden, den
  iOS-Abnahme-Stand verifizieren und erst dann TestFlight freigeben.
- **Darf fachliche Screens nicht neben den Besitzern umgestalten.**

## Mobile Experience Excellence

Parität allein genügt nicht. Jede neue oder übertragene Funktion wird erst
abgehakt, wenn sie diese Kriterien erfüllt:

- **Nativ gedacht:** Web ist fachliche Referenz, nicht Layout-Vorlage.
  Desktop-Tabellen, Hover-Menüs und Seitendrawers werden zu listenbasierten
  Flows, nativen Stacks, Sheets und eindeutigen Touch-Zielen.
- **Einhandfähig:** Der häufigste Weg funktioniert in ungefähr 30 Sekunden;
  primäre Aktionen liegen erreichbar, Interaktionen haben mindestens 44 px.
- **Progressiv:** Zuerst Entscheidung und Ergebnis, Details erst auf Tap.
  Unsichere oder dringende Daten dürfen nicht versteckt sein.
- **Sicher und verzeihend:** Destruktives verlangt eine klare Bestätigung.
  Gesten sind nur Beschleuniger und haben immer eine sichtbare Alternative;
  sie bleiben mit einem Tap rückgängig.
- **Spürbar, nicht verspielt:** Haptik nur bei echten Zustandswechseln,
  Motion kurz, unterbrechbar und mit Reduced-Motion-Alternative.
- **Echte Zustände:** Laden, leer, offline, Fehler, Retry, Berechtigungen,
  lange deutsche Texte und große Schrift sind Teil jedes PRs.

## Abnahme-Regel

Vor internem TestFlight müssen sämtliche Zeilen für iOS `✅` sein, inklusive
E2E- und Real-iPhone-Nachweis. Android folgt danach auf derselben
Expo-Codebasis mit einer eigenen, gleich aufgebauten Nachweisspalte.
