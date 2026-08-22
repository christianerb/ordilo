# Mobile-Paritäts-Matrix

Die Web-App in `src/` bleibt die fachliche Referenz. Diese Matrix erfasst
jede Endnutzer-Funktion, ihren nativen Ersatz und die Nachweise für iOS.
`✅` bedeutet implementiert und lokal geprüft. `🟡` bedeutet teilweise
implementiert. `⬜` bedeutet noch offen. Kein Bereich gilt als fertig, solange
eine seiner Zeilen offen ist.

| Bereich | Web-Funktion | iOS-Screen | API/DB | Unit-Test | E2E | Real-iPhone | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fundament | Session, SecureStore, App-Gate | Root, Login | Supabase Auth/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| Onboarding | Familie erstellen, Welcome | Onboarding, Willkommen | Supabase RPC/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| Einladungen | Link, Annahme, Merge | Invite-Route | RPC/API | ✅ | ⬜ | ⬜ | 🟡 |
| Heute | Prioritäten, Aufgaben, Hinweise | Heute | Supabase/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| Scan & Import | Kamera, Bilder, Dateien, Mehrseiten, Queue | Scan | Upload, OCR, Analyse | ✅ | ⬜ | ⬜ | 🟡 |
| Review | Analyse, Korrekturen, Original, Bestätigung | Dokument-Review | Analyse/Confirm API | ✅ | ⬜ | ⬜ | 🟡 |
| Ablage | Dokumentliste, Suche, Statusfilter | Ablage | Supabase/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| Ablage | Sortierung und serverseitige Pagination | Ablage | Supabase/RLS | ✅ | ⬜ | ⬜ | 🟡 |
| Ablage | Details, Original, Metadaten | Dokument-Detail | File API/Supabase | ✅ | ⬜ | ⬜ | 🟡 |
| Ablage | Credentials/Secrets sicher anzeigen | Dokument-Detail | Secret API | ✅ | ⬜ | ⬜ | 🟡 |
| Ablage | Dokument löschen, Bestätigung, Fehlerzustand | Dokument-Detail | Delete API | ✅ | ⬜ | ⬜ | 🟡 |
| Notizen | Liste, erstellen, bearbeiten, löschen | Ablage/Notizen | Notes API/Supabase | ⬜ | ⬜ | ⬜ | ⬜ |
| Kontakte | Liste, erstellen, bearbeiten, Aktionen | Ablage/Kontakte | Supabase/API | ⬜ | ⬜ | ⬜ | ⬜ |
| Sammlungen | Liste, erstellen, bearbeiten, Beziehungen | Sammlungen | Supabase/API | ⬜ | ⬜ | ⬜ | ⬜ |
| Ordilo fragen | Suche, Chat, Streaming, Quellen, Feedback | Suche | Search/Chat API | ⬜ | ⬜ | ⬜ | ⬜ |
| Ordilo fragen | KI-Aktionen, Bestätigen/Anpassen/Verwerfen/Undo | Suche | Actions API | ⬜ | ⬜ | ⬜ | ⬜ |
| Familienplaner | Aufgaben, Zuständigkeiten, Fälligkeiten, Undo | Plan | Supabase/RPC | 🟡 | ⬜ | ⬜ | 🟡 |
| Familienplaner | Kalender, Wiederholungen, Konflikte, Vorschläge | Plan | Supabase/RPC | ⬜ | ⬜ | ⬜ | ⬜ |
| Familie | Mitglieder, Profile, Fotos, Beziehungen, Timeline | Familie | Supabase/API | 🟡 | ⬜ | ⬜ | 🟡 |
| Familie | Einstellungen, Inbound-Adresse, Kalenderfeed | Familie/Einstellungen | API/Supabase | ⬜ | ⬜ | ⬜ | ⬜ |
| Datenschutz | Rechtliches, Konto-/Familien-Löschung | Einstellungen | API/Supabase | ⬜ | ⬜ | ⬜ | ⬜ |
| Qualitätslayer | Deep Links, Share, Push, Privacy-Overlay, Biometrie | App-weit | Native APIs | 🟡 | ⬜ | ⬜ | 🟡 |

## Abnahme-Regel

Vor internem TestFlight müssen sämtliche Zeilen für iOS `✅` sein, inklusive
E2E- und Real-iPhone-Nachweis. Android folgt danach auf derselben
Expo-Codebasis mit einer eigenen, gleich aufgebauten Nachweisspalte.
