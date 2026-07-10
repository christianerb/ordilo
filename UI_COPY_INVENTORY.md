# Ordilo — UI Copy String Inventory

A comprehensive inventory of every user-facing German copy string in the
Ordilo Next.js app, organized by category. Each entry lists the file path,
the exact current text, and the context in which it appears.

Legend: `→` = context.

---

## 1. Empty States

| # | Text | File | Context |
|---|------|------|---------|
| 1.1 | `"Noch nichts zu erledigen"` | `src/app/(app)/aufgaben/page.tsx` | Empty state when no tasks exist at all |
| 1.2 | `"Scanne ein Dokument und Ordilo merkt sich automatisch, was ansteht."` | `src/app/(app)/aufgaben/page.tsx` | Empty state description (no tasks) |
| 1.3 | `"Nichts überfällig"` | `src/app/(app)/aufgaben/page.tsx` | Column-empty hint (Überfällig column) |
| 1.4 | `"Alles im Griff"` | `src/app/(app)/aufgaben/page.tsx` | Column-empty hint (Diese Woche column) |
| 1.5 | `"Nichts eingeplant"` | `src/app/(app)/aufgaben/page.tsx` | Column-empty hint (Später column) |
| 1.6 | `"Noch nichts erledigt"` | `src/app/(app)/aufgaben/page.tsx` | Column-empty hint (Erledigt column) |
| 1.7 | `"Noch nichts gescannt"` | `src/app/(app)/dokumente/page.tsx` | Empty state when no documents |
| 1.8 | `"Halte die Kamera auf ein Dokument — Ordilo erledigt den Rest."` | `src/app/(app)/dokumente/page.tsx` | Empty state description (no documents) |
| 1.9 | `"Noch keine Dokumente"` | `src/app/(app)/familie/[id]/profile-client.tsx` | Empty state (profile, documents section) |
| 1.10 | `"Sobald ein Dokument diese Person betrifft, erscheint es hier."` | `src/app/(app)/familie/[id]/profile-client.tsx` | Empty state description (profile documents) |
| 1.11 | `"Noch nichts passiert"` | `src/app/(app)/familie/[id]/profile-client.tsx` | Empty state (profile, timeline section) |
| 1.12 | `"Sobald es etwas Neues gibt, steht's hier."` | `src/app/(app)/familie/[id]/profile-client.tsx` | Empty state description (profile timeline) |
| 1.13 | `"Alles erledigt"` | `src/app/(app)/familie/[id]/profile-client.tsx` | Empty state (profile, tasks section) |
| 1.14 | `"Für diese Person steht aktuell nichts an."` | `src/app/(app)/familie/[id]/profile-client.tsx` | Empty state description (profile tasks) |
| 1.15 | `"Noch niemand hier. Füge die erste Person hinzu — Ordilo erkennt sie dann automatisch auf deinen Dokumenten."` | `src/app/(app)/familie/familie-client.tsx` | Empty hint when family has zero members |
| 1.16 | `"Schön, dass du da bist"` | `src/app/(app)/home/home-client.tsx` | First-visit empty state heading |
| 1.17 | `"Scanne dein erstes Dokument und Ordilo bringt Ordnung in deine Papierkram."` | `src/app/(app)/home/home-client.tsx` | First-visit empty state description |
| 1.18 | `"Alles durchgesehen"` | `src/app/(app)/home/home-client.tsx` | Empty state when no analyzed docs ("Zum Durchsehen" section) |
| 1.19 | `"Noch keine Dokumente"` | `src/app/(app)/home/home-client.tsx` | Empty state when no recent docs ("Zuletzt gescannt" section) |
| 1.20 | `"Noch keine Dokumente hier"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Empty state (collection, no documents) |
| 1.21 | `"Dokumente landen hier automatisch, sobald ihre Kategorie zu dieser Sammlung passt."` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Empty state description (collection) |
| 1.22 | `"Keine Dokumente gefunden."` | `src/components/ordilo/documents-table.tsx` | Table empty state (no rows match filters/search) |
| 1.23 | `"Noch keine Chats."` | `src/app/(app)/suche/suche-client.tsx` | Chat list dropdown when no conversations exist |
| 1.24 | `"Wie kann ich dir helfen?"` | `src/app/(app)/suche/suche-client.tsx` | Suche empty state heading (no messages yet) |
| 1.25 | `"Frag Ordilo alles über deine Dokumente. Hier sind ein paar Ideen:"` | `src/app/(app)/suche/suche-client.tsx` | Suche empty state description |

---

## 2. Buttons & CTAs

| # | Text | File | Context |
|---|------|------|---------|
| 2.1 | `"Dokument scannen"` | `src/app/(app)/aufgaben/page.tsx` | Empty-state CTA (no tasks) |
| 2.2 | `"Scannen"` | `src/app/(app)/dokumente/page.tsx` | Header scan button |
| 2.3 | `"Dokument scannen"` | `src/app/(app)/dokumente/page.tsx` | Empty-state CTA (no documents) |
| 2.4 | `"PDF hochladen"` | `src/app/(app)/dokumente/page.tsx` | Compact upload link at bottom |
| 2.5 | `"Abbrechen"` | `src/app/(app)/aufgaben/page.tsx` | Delete-task confirmation sheet cancel button |
| 2.6 | `"Löschen"` | `src/app/(app)/aufgaben/page.tsx` | Delete-task confirmation sheet confirm button |
| 2.7 | `"Abbrechen"` | `src/app/(app)/dokumente/page.tsx` | Delete-document confirmation sheet cancel button |
| 2.8 | `"Löschen"` | `src/app/(app)/dokumente/page.tsx` | Delete-document confirmation sheet confirm button |
| 2.9 | `"Person hinzufügen"` | `src/app/(app)/familie/familie-client.tsx` | Dashed add-member button |
| 2.10 | `"Hinzufügen"` | `src/app/(app)/familie/familie-client.tsx` | Add-member sheet submit label (passed to MemberForm) |
| 2.11 | `"Speichern"` | `src/app/(app)/familie/familie-client.tsx` | Edit-member sheet submit label |
| 2.12 | `"Entfernen"` | `src/app/(app)/familie/familie-client.tsx` | Remove-member dialog confirm button |
| 2.13 | `"Abbrechen"` | `src/app/(app)/familie/familie-client.tsx` | Remove-member dialog cancel button |
| 2.14 | `"Bearbeiten"` | `src/app/(app)/familie/familie-client.tsx` | Member row menu item (edit) |
| 2.15 | `"Entfernen"` | `src/app/(app)/familie/familie-client.tsx` | Member row menu item (remove) |
| 2.16 | `"Erneut versuchen"` | `src/app/(app)/familie/familie-client.tsx` | Fetch-error retry button |
| 2.17 | `"Speichern"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Family name save button |
| 2.18 | `"Erneut versuchen"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Fetch-error retry button |
| 2.19 | `"Dokument scannen"` | `src/app/(app)/home/home-client.tsx` | First-visit CTA + empty-section CTA links |
| 2.20 | `"Scannen"` | `src/app/(app)/home/home-client.tsx` | Scan tile label |
| 2.21 | `"Weiter"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Family-name step submit button |
| 2.22 | `"Person hinzufügen"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Add-member step submit button |
| 2.23 | `"Weitere Person hinzufügen"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Choose-next step add-another button |
| 2.24 | `"Fertig"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Choose-next step finish button |
| 2.25 | `"Erneut versuchen"` | `src/app/(app)/onboarding/onboarding-error.tsx` | Onboarding error retry button |
| 2.26 | `"Abbrechen"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Delete-collection dialog cancel button |
| 2.27 | `"Löschen"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Delete-collection dialog confirm button |
| 2.28 | `"Änderungen speichern"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Edit-collection sheet submit label (passed to CollectionForm) |
| 2.29 | `"Sammlung hinzufügen"` | `src/components/ordilo/app-shell.tsx` | Sidebar "add collection" button (expanded) + sheet submit label (passed to CollectionForm) |
| 2.30 | `"Scannen"` | `src/components/ordilo/app-shell.tsx` | Mobile/desktop bottom composer scan button |
| 2.31 | `"Nochmal versuchen"` | `src/components/ordilo/document-card.tsx` | Failed-document retry button |
| 2.32 | `"Nochmal versuchen"` | `src/components/ordilo/review-card/states.tsx` | ReviewCardError retry button |
| 2.33 | `"Nochmal lesen"` | `src/components/ordilo/review-card/content.tsx` | Review Card re-analyze button |
| 2.34 | `"Nochmal lesen"` | `src/components/ordilo/review-card/states.tsx` | Confirmed state re-analyze button |
| 2.35 | `"Ins Familienbuch übernehmen"` | `src/components/ordilo/review-card/content.tsx` | Confirm button (full Review Card) |
| 2.36 | `"Bitte Person wählen"` | `src/components/ordilo/review-card/content.tsx` | Confirm button label when disambiguation is unresolved |
| 2.37 | `"Alles bestätigen"` | `src/components/ordilo/review-summary.tsx` | Review summary confirm button |
| 2.38 | `"Bitte Person wählen"` | `src/components/ordilo/review-summary.tsx` | Review summary confirm button (disambiguation pending) |
| 2.39 | `"Bearbeiten"` | `src/components/ordilo/review-summary.tsx` | Review summary edit button |
| 2.40 | `"Fertig"` | `src/components/ordilo/scan-wizard/review-step.tsx` | Review-step done button after confirmation |
| 2.41 | `"Nochmal versuchen"` | `src/components/ordilo/scan-wizard/processing-step.tsx` | Processing-step failure retry button |
| 2.42 | `"Nochmal versuchen"` | `src/components/ordilo/scan-wizard/upload-progress.tsx` | Upload-progress error retry button |
| 2.43 | `"Schließen"` | `src/components/ordilo/scan-wizard/upload-progress.tsx` | Upload-progress error dismiss button |
| 2.44 | `"Aus Galerie wählen"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera fallback gallery button (no permission / no camera) |
| 2.45 | `"Original ansehen"` | `src/components/ordilo/review-card/confirmed-details.tsx` | Confirmed detail "view original file" button |
| 2.46 | `"Link senden"` | `src/app/(auth)/login/login-form.tsx` | Login form submit button |
| 2.47 | `"Zurück zur Anmeldung"` | `src/app/(auth)/auth/auth-error/page.tsx` | Auth-error page back link |
| 2.48 | `"Wieder öffnen"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail toggle button (when done) |
| 2.49 | `"Erledigt"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail toggle button (when open) |
| 2.50 | `"Speichern"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail save button (when changes exist) |
| 2.51 | `"Filter zurücksetzen"` | `src/components/ordilo/documents-table.tsx` | Reset all filters link (table view) |
| 2.52 | `"Filter zurücksetzen"` | `src/components/ordilo/documents-table.tsx` | Reset filters inline link in empty table state |
| 2.53 | `"Filter löschen"` | `src/app/(app)/dokumente/page.tsx` | Clear filters link (folder view) |
| 2.54 | `"Zurücksetzen"` | `src/app/(app)/suche/filter-chips.tsx` | Clear all filter chips button |
| 2.55 | `"Neu"` | `src/app/(app)/suche/suche-client.tsx` | New chat button (sm+ label) |

---

## 3. Labels & Headings

| # | Text | File | Context |
|---|------|------|---------|
| 3.1 | `"Aufgaben"` | `src/app/(app)/aufgaben/page.tsx` | Page heading |
| 3.2 | `"Überfällig"` | `src/app/(app)/aufgaben/page.tsx` | Board column label |
| 3.3 | `"Diese Woche"` | `src/app/(app)/aufgaben/page.tsx` | Board column label |
| 3.4 | `"Später"` | `src/app/(app)/aufgaben/page.tsx` | Board column label |
| 3.5 | `"Erledigt"` | `src/app/(app)/aufgaben/page.tsx` | Board column label |
| 3.6 | `"Dokumente"` | `src/app/(app)/dokumente/page.tsx` | Page heading |
| 3.7 | `"Zum Durchsehen"` | `src/app/(app)/dokumente/page.tsx` | Review-queue section heading + status filter chip |
| 3.8 | `"Im Familienbuch"` | `src/app/(app)/dokumente/page.tsx` | Confirmed-docs section heading + status filter chip |
| 3.9 | `"Ordner"` | `src/app/(app)/dokumente/page.tsx` | Folder-view toggle tab label |
| 3.10 | `"Tabelle"` | `src/app/(app)/dokumente/page.tsx` | Table-view toggle tab label |
| 3.11 | `"Rechnungen"` | `src/app/(app)/dokumente/page.tsx` | Folder label (invoice) |
| 3.12 | `"Briefe"` | `src/app/(app)/dokumente/page.tsx` | Folder label (letter) |
| 3.13 | `"Verträge"` | `src/app/(app)/dokumente/page.tsx` | Folder label (contract) |
| 3.14 | `"Arztbriefe"` | `src/app/(app)/dokumente/page.tsx` | Folder label (medical) |
| 3.15 | `"Schule"` | `src/app/(app)/dokumente/page.tsx` | Folder label (school) |
| 3.16 | `"Versicherungen"` | `src/app/(app)/dokumente/page.tsx` | Folder label (insurance) |
| 3.17 | `"Steuer"` | `src/app/(app)/dokumente/page.tsx` | Folder label (tax) |
| 3.18 | `"Sonstiges"` | `src/app/(app)/dokumente/page.tsx` | Folder label (other) |
| 3.19 | `"Alle"` | `src/app/(app)/dokumente/page.tsx` | Status filter chip (all) |
| 3.20 | `"Dokumente"` | `src/app/(app)/familie/[id]/profile-client.tsx` | Profile section heading (documents) |
| 3.21 | `"Verlauf"` | `src/app/(app)/familie/[id]/profile-client.tsx` | Profile section heading (timeline) |
| 3.22 | `"Offene Aufgaben"` | `src/app/(app)/familie/[id]/profile-client.tsx` | Profile section heading (tasks) |
| 3.23 | `"Zurück zur Familie"` | `src/app/(app)/familie/[id]/profile-client.tsx` | Back link (profile → /familie) |
| 3.24 | `"Familieneinstellungen"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Page heading |
| 3.25 | `"Familienname"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Field label + onboarding label |
| 3.26 | `"Mitglieder"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Info-card label |
| 3.27 | `"Erstellt am"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Info-card label |
| 3.28 | `"Zurück zur Familie"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Back link (settings → /familie) |
| 3.29 | `"Person hinzufügen"` | `src/app/(app)/familie/familie-client.tsx` | Add-member sheet title |
| 3.30 | `"Bearbeiten"` | `src/app/(app)/familie/familie-client.tsx` | Edit-member sheet title |
| 3.31 | `"Person entfernen"` | `src/app/(app)/familie/familie-client.tsx` | Remove-member dialog title |
| 3.32 | `"Hinweise"` | `src/app/(app)/home/home-client.tsx` | Insights section heading |
| 3.33 | `"Aufgaben"` | `src/app/(app)/home/home-client.tsx` | Aufgaben section heading |
| 3.34 | `"Überfällig"` | `src/app/(app)/home/home-client.tsx` | Task subgroup label (home) |
| 3.35 | `"Diese Woche"` | `src/app/(app)/home/home-client.tsx` | Task subgroup label (home) |
| 3.36 | `"Später"` | `src/app/(app)/home/home-client.tsx` | Task subgroup label (home) |
| 3.37 | `"Zum Durchsehen"` | `src/app/(app)/home/home-client.tsx` | Section heading (analyzed docs) |
| 3.38 | `"Zuletzt gescannt"` | `src/app/(app)/home/home-client.tsx` | Section heading (recent docs) |
| 3.39 | `"Neues Dokument"` | `src/app/(app)/home/home-client.tsx` | Scan tile subtitle |
| 3.40 | `"Keine Aufgaben offen"` / `"Aufgabe offen"` / `"Aufgaben offen"` | `src/app/(app)/home/home-client.tsx` | Stat-tile subtitle (0/1/n) |
| 3.41 | `"Familienname"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Field label |
| 3.42 | `"Name"` | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Member-name field label |
| 3.43 | `"Rolle"` | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Optional member-role field label |
| 3.44 | `"Geburtsdatum"` | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Optional member-birthdate field label |
| 3.45 | `"Farbe"` | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Avatar color picker label |
| 3.46 | `"Daten konnten nicht geladen werden"` | `src/app/(app)/onboarding/onboarding-error.tsx` | Onboarding error heading |
| 3.47 | `"Daten konnten nicht geladen werden."` | `src/app/(app)/familie/familie-client.tsx` | Fetch-error message (familie page) |
| 3.48 | `"Daten konnten nicht geladen werden"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Fetch-error heading |
| 3.49 | `"Sammlungen"` | `src/components/ordilo/app-shell.tsx` | Sidebar section heading |
| 3.50 | `"Sammlung hinzufügen"` | `src/components/ordilo/app-shell.tsx` | Add-collection sheet title |
| 3.51 | `"Name"` | `src/components/ordilo/collection-form.tsx` | Collection-name field label |
| 3.52 | `"Icon"` | `src/components/ordilo/collection-form.tsx` | Collection-icon picker label |
| 3.53 | `"Farbe"` | `src/components/ordilo/collection-form.tsx` | Collection-color picker label |
| 3.54 | `"Sammlung bearbeiten"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Edit-collection sheet title |
| 3.55 | `"Sammlung löschen"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Delete-collection dialog title + delete button aria-label |
| 3.56 | `"Aufgabendetails"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail sheet title |
| 3.57 | `"Verlinkte Dokumente"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail linked-docs section label |
| 3.58 | `"Hauptdokument"` | `src/components/ordilo/task-detail-sheet.tsx` | Primary doc badge in task detail |
| 3.59 | `"Personen"` | `src/components/ordilo/review-card/content.tsx` + `confirmed-details.tsx` | Review/confirmed field-section label |
| 3.60 | `"Organisationen"` | `src/components/ordilo/review-card/content.tsx` + `confirmed-details.tsx` | Review/confirmed field-section label |
| 3.61 | `"Daten"` | `src/components/ordilo/review-card/content.tsx` + `confirmed-details.tsx` | Review/confirmed field-section label |
| 3.62 | `"Beträge"` | `src/components/ordilo/review-card/content.tsx` + `confirmed-details.tsx` | Review/confirmed field-section label |
| 3.63 | `"Aufgaben"` | `src/components/ordilo/review-card/content.tsx` + `confirmed-details.tsx` | Review/confirmed field-section label |
| 3.64 | `"Kategorie"` | `src/components/ordilo/review-card/content.tsx` + `confirmed-details.tsx` | Review/confirmed field-section label |
| 3.65 | `"Tags"` | `src/components/ordilo/review-card/content.tsx` + `confirmed-details.tsx` | Review/confirmed field-section label |
| 3.66 | `"Ordilo hat erkannt"` | `src/components/ordilo/review-summary.tsx` | Highlights section heading |
| 3.67 | `"Ordilo wird Folgendes für dich erledigen"` | `src/components/ordilo/review-summary.tsx` | Auto-actions section heading |
| 3.68 | `"Dokument"` | `src/components/ordilo/documents-table.tsx` | Table column header (title) |
| 3.69 | `"Typ"` | `src/components/ordilo/documents-table.tsx` | Table column header |
| 3.70 | `"Personen"` | `src/components/ordilo/documents-table.tsx` | Table column header |
| 3.71 | `"Kategorie"` | `src/components/ordilo/documents-table.tsx` | Table column header |
| 3.72 | `"Tags"` | `src/components/ordilo/documents-table.tsx` | Table column header |
| 3.73 | `"Datum"` | `src/components/ordilo/documents-table.tsx` | Table column header + sort-aria label fragment |
| 3.74 | `"Status"` | `src/components/ordilo/documents-table.tsx` | Table column header |
| 3.75 | `"E-Mail-Adresse"` | `src/app/(auth)/login/login-form.tsx` | Login field label |
| 3.76 | `"Willkommen"` | `src/app/(auth)/login/login-form.tsx` | Login page heading |
| 3.77 | `"Anmeldelink ungültig"` | `src/app/(auth)/auth/auth-error/page.tsx` | Auth-error page heading |
| 3.78 | `"Hoch"` / `"Mittel"` / `"Niedrig"` | `src/components/ordilo/task-detail-sheet.tsx` + `src/components/ordilo/review-card/helpers.tsx` + `src/lib/task-utils.ts` | Priority labels |
| 3.79 | `"Relevanz"` (aria) | `src/components/ordilo/source-card.tsx` | aria-label prefix for source-card score |
| 3.80 | `"Quellen"` | `src/app/(app)/suche/message-bubble.tsx` | Sources section label above citations |
| 3.81 | `"Weitere mögliche Dokumente"` | `src/app/(app)/suche/message-bubble.tsx` | Sub-label below top sources |

---

## 4. Placeholder Text

| # | Text | File | Context |
|---|------|------|---------|
| 4.1 | `"Dokument suchen..."` | `src/app/(app)/dokumente/page.tsx` | Documents search input placeholder |
| 4.2 | `"Suchen …"` | `src/components/ordilo/documents-table.tsx` | Table search input placeholder |
| 4.3 | `"Frage Ordilo oder suche nach Dokumenten…"` | `src/components/ordilo/ai-search-bar.tsx` (default prop) + `src/components/ordilo/app-shell.tsx` | AI search bar placeholder (mobile + desktop composer) |
| 4.4 | `"z. B. Familie Müller"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Family-name input placeholder |
| 4.5 | `"z. B. Emma"` | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Member-name input placeholder |
| 4.6 | `"z. B. Vater, Mutter, Kind"` | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Member-role input placeholder |
| 4.7 | `"z. B. Versicherungen"` | `src/components/ordilo/collection-form.tsx` | Collection-name input placeholder |
| 4.8 | `"du@beispiel.de"` | `src/app/(auth)/login/login-form.tsx` | Email input placeholder |
| 4.9 | `"Aufgabentitel"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail title input placeholder |
| 4.10 | `"Notizen, Details, was zu tun ist…"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail description textarea placeholder |
| 4.11 | `"Tag hinzufügen…"` | `src/components/ordilo/task-detail-sheet.tsx` | Task detail tag-input placeholder |
| 4.12 | `"Eigene Kategorie"` | `src/components/ordilo/review-card/edit-controls.tsx` | Category free-text input placeholder |
| 4.13 | `"Person wählen …"` | `src/components/ordilo/review-card/edit-controls.tsx` | Person-edit select placeholder option |

---

## 5. Hints & Helper Text

| # | Text | File | Context |
|---|------|------|---------|
| 5.1 | `"Alles, was Ordilo für dich abgelegt hat."` | `src/app/(app)/dokumente/page.tsx` | Page subtitle (no documents yet) |
| 5.2 | `"${documents.length} Dokumente · ${reviewDocs.length} zum Durchsehen · ${confirmedDocs.length} im Familienbuch"` (template) | `src/app/(app)/dokumente/page.tsx` | Page subtitle (with documents) |
| 5.3 | `"oder Datei hierher ziehen"` | `src/app/(app)/dokumente/page.tsx` | Drag-hint next to "PDF hochladen" |
| 5.4 | `"Datei hier ablegen"` | `src/app/(app)/dokumente/page.tsx` | Drag-overlay heading |
| 5.5 | `"${visibleTasks.filter(open).length} offen · ${visibleTasks.filter(done).length} erledigt"` (template) | `src/app/(app)/aufgaben/page.tsx` | Aufgaben header count summary |
| 5.6 | `"Gib einen Namen ein. Weitere Angaben sind optional."` | `src/app/(app)/familie/familie-client.tsx` | Add-member sheet description |
| 5.7 | `"Ändere die Angaben dieser Person."` | `src/app/(app)/familie/familie-client.tsx` | Edit-member sheet description |
| 5.8 | `"Möchtest du {name} wirklich entfernen?"` (template) | `src/app/(app)/familie/familie-client.tsx` | Remove-member dialog description |
| 5.9 | `"Es ist ein Fehler aufgetreten. Bitte versuche es erneut."` | `src/app/(app)/familie/einstellungen/settings-client.tsx` + `src/app/(app)/onboarding/onboarding-error.tsx` | Fetch-error description |
| 5.10 | `"Gib der Sammlung einen Namen, ein Icon und eine Farbe."` | `src/components/ordilo/app-shell.tsx` | Add-collection sheet description |
| 5.11 | `"Ändere Name, Icon oder Farbe dieser Sammlung."` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Edit-collection sheet description |
| 5.12 | `"Möchtest du {name} wirklich löschen? Keine Sorge, die Dokumente bleiben erhalten."` (template) | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Delete-collection dialog description |
| 5.13 | `"Details und Einstellungen für diese Aufgabe"` (sr-only) | `src/components/ordilo/task-detail-sheet.tsx` | Task detail sheet sr-only description |
| 5.14 | `"Details und Metadaten für dieses Dokument"` (sr-only) | `src/components/ordilo/document-detail-sheet.tsx` | Document detail sheet sr-only description |
| 5.15 | `"Hauptmenü"` (sr-only) | `src/components/ordilo/app-shell.tsx` | Mobile drawer sr-only description |
| 5.16 | `"Mit der Anmeldung stimmst du den Nutzungsbedingungen zu."` | `src/app/(auth)/login/login-form.tsx` | Login form footer helper text |
| 5.17 | `"Weitere Angaben (optional)"` | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Optional-fields toggle button label |
| 5.18 | `"Das bin ich"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | "This is me" self-link toggle label |
| 5.19 | `"Ordilo merkt sich offene Fristen — hier kannst du sie jetzt erledigen."` | `src/app/(app)/home/home-client.tsx` | Überfällig subgroup subtitle |
| 5.20 | `"Ein paar Angaben sind unsicher — kurz drüberschauen lohnt sich."` | `src/components/ordilo/review-summary.tsx` | needs_user_review notice text |
| 5.21 | `"Ich bin mir nicht sicher, ob dieses Dokument zu {A} oder {B} gehört"` (template) | `src/components/ordilo/review-card/helpers.tsx` | Disambiguation prompt text |
| 5.22 | `"Ich bin mir nicht sicher, wem dieses Dokument zugeordnet werden soll"` | `src/components/ordilo/review-card/helpers.tsx` | Disambiguation prompt (single candidate) |
| 5.23 | `"Bitte wähle die richtige Person:"` | `src/components/ordilo/review-card/helpers.tsx` | Disambiguation prompt helper text |
| 5.24 | `"Überprüfung nötig"` | `src/components/ordilo/review-card/content.tsx` | needs_user_review badge label |
| 5.25 | `"Alle Aufgaben wurden entfernt."` | `src/components/ordilo/review-card/content.tsx` | Empty-tasks note (all deleted in review) |

---

## 6. Error Messages

| # | Text | File | Context |
|---|------|------|---------|
| 6.1 | `"Aufgaben konnten nicht geladen werden."` | `src/app/(app)/aufgaben/page.tsx` | Aufgaben fetch error |
| 6.2 | `"Etwas ist schiefgelaufen. Bitte erneut versuchen."` | `src/app/(app)/aufgaben/page.tsx` (catch) + `src/app/(app)/onboarding/onboarding-flow.tsx` (guard) + `src/app/(app)/familie/actions.ts` (FRIENDLY_ERROR) + `src/app/(app)/onboarding/actions.ts` (FRIENDLY_ERROR) + `src/app/(app)/sammlungen/actions.ts` (FRIENDLY_ERROR) | Generic friendly error |
| 6.3 | `"Etwas ist schiefgelaufen."` | `src/components/ordilo/task-detail-sheet.tsx` | Task save catch error |
| 6.4 | `"Speichern hat nicht geklappt."` | `src/components/ordilo/task-detail-sheet.tsx` | Task save DB error |
| 6.5 | `"Speichern hat nicht geklappt — bitte nochmal versuchen"` | `src/app/(app)/aufgaben/page.tsx` + `src/app/(app)/home/home-client.tsx` | Toast: toggle-done error |
| 6.6 | `"Verwerfen hat nicht geklappt — bitte nochmal versuchen"` | `src/app/(app)/aufgaben/page.tsx` | Toast: dismiss error |
| 6.7 | `"Hat nicht geklappt — bitte nochmal versuchen"` | `src/app/(app)/home/home-client.tsx` | Toast: dismiss error (home) |
| 6.8 | `"Bestätigen hat nicht geklappt. Bitte nochmal versuchen."` | `src/components/ordilo/review-card/index.tsx` + `src/components/ordilo/scan-wizard/review-step.tsx` | Confirm API fallback error |
| 6.9 | `"Bestätigung fehlgeschlagen. Bitte erneut versuchen."` | `src/components/ordilo/review-card/index.tsx` + `src/components/ordilo/scan-wizard/review-step.tsx` | Confirm catch fallback |
| 6.10 | `"Das hat nicht geklappt. Bitte nochmal versuchen."` | `src/components/ordilo/review-card/index.tsx` (reanalyze) + `src/app/(auth)/login/login-form.tsx` (signInWithOtp error) | Generic retry error |
| 6.11 | `"Analyse fehlgeschlagen. Bitte erneut versuchen."` | `src/components/ordilo/review-card/index.tsx` | Reanalyze catch fallback |
| 6.12 | `"Bitte wähle zuerst die richtige Person aus, bevor du bestätigst."` | `src/components/ordilo/review-card/index.tsx` | Confirm blocked by disambiguation |
| 6.13 | `"Keine Analysedaten vorhanden. Bitte neu analysieren."` | `src/components/ordilo/review-card/index.tsx` | No analysis data error |
| 6.14 | `"Das hat nicht geklappt"` | `src/lib/schemas/document.ts` (FAILED_CARD_COPY) | Friendly failed-document copy (used in DocumentCard + ReviewCardError) |
| 6.15 | `"Das hat nicht geklappt"` | `src/components/ordilo/review-card/states.tsx` | ReviewCardError heading |
| 6.16 | `"{FAILED_CARD_COPY}. Bitte nochmal versuchen."` → `"Das hat nicht geklappt. Bitte nochmal versuchen."` | `src/components/ordilo/review-card/states.tsx` + `src/components/ordilo/scan-wizard/processing-step.tsx` | ReviewCardError body / processing-step failure body |
| 6.17 | `"Datei konnte nicht geöffnet werden."` | `src/components/ordilo/review-card/states.tsx` | Signed-URL fetch error (confirmed details) |
| 6.18 | `"Upload hat nicht geklappt. Bitte nochmal versuchen."` | `src/lib/scan/scan-context.tsx` | Upload catch fallback |
| 6.19 | `"Dieser Dateityp wird nicht unterstützt. Bitte ein Bild oder PDF hochladen."` | `src/lib/schemas/document.ts` | File validation: unsupported type |
| 6.20 | `"Die Datei ist zu groß. Maximum: 25 MB."` (template with MAX_FILE_SIZE_LABEL) | `src/lib/schemas/document.ts` | File validation: too large |
| 6.21 | `"Der Dateiinhalt stimmt nicht mit dem angegebenen Dateityp überein."` | `src/lib/schemas/document.ts` | File validation: signature mismatch |
| 6.22 | `"Ungültige Familien-ID"` | `src/lib/schemas/document.ts` | Upload family_id schema error |
| 6.23 | `"Bitte einen Namen eingeben"` | `src/app/(app)/familie/familie-client.tsx` (validation) + `src/app/(app)/onboarding/onboarding-flow.tsx` (validation) + `src/lib/schemas/onboarding.ts` | Member name validation error |
| 6.24 | `"Bitte gib einen Familiennamen ein"` | `src/app/(app)/onboarding/onboarding-flow.tsx` (validation) + `src/lib/schemas/onboarding.ts` | Family name validation error |
| 6.25 | `"Bitte gib einen Namen ein"` | `src/components/ordilo/collection-form.tsx` (validation) + `src/lib/schemas/collections.ts` | Collection name validation error |
| 6.26 | `"Der Familienname ist zu lang (maximal 100 Zeichen)"` | `src/lib/schemas/onboarding.ts` | Family name length error |
| 6.27 | `"Der Name ist zu lang (maximal 100 Zeichen)"` | `src/lib/schemas/onboarding.ts` | Member name length error |
| 6.28 | `"Die Rolle ist zu lang (maximal 50 Zeichen)"` | `src/lib/schemas/onboarding.ts` | Member role length error |
| 6.29 | `"Bitte ein gültiges Geburtsdatum eingeben"` | `src/lib/schemas/onboarding.ts` | Member birthdate validation error |
| 6.30 | `"Bitte E-Mail-Adresse eingeben"` | `src/lib/auth/validation.ts` | Login email required error |
| 6.31 | `"Bitte gültige E-Mail-Adresse eingeben"` | `src/lib/auth/validation.ts` | Login email invalid format error |
| 6.32 | `"Das hat nicht geklappt. Bitte versuch's nochmal."` | `src/app/(app)/onboarding/onboarding-flow.tsx` (NETWORK_ERROR) + `src/app/(auth)/login/login-form.tsx` | Friendly retry error (onboarding network + login) |
| 6.33 | `"Diese Sammlung gibt es schon."` | `src/app/(app)/sammlungen/actions.ts` | Duplicate collection name error |
| 6.34 | `"Da ist was schiefgegangen. Bitte frag nochmal."` | `src/app/(app)/suche/suche-client.tsx` | Chat fetch error message bubble |
| 6.35 | `"Du hast heute viele Fragen gestellt. Das Tageslimit ist erreicht — bitte morgen weiter."` | `src/app/(app)/suche/suche-client.tsx` | Chat rate-limit (429) message bubble |
| 6.36 | `"Dieser Anmeldelink ist abgelgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an."` | `src/app/(auth)/auth/auth-error/page.tsx` | Auth-error page description |
| 6.37 | API route error strings (surfaced in fetch failures) | `src/app/api/documents/upload/route.ts`, `analyze/route.ts`, `ocr/route.ts`, `confirm/route.ts`, `file/route.ts`, `chat/route.ts`, `conversations/[id]/route.ts`, `chat/feedback/route.ts`, `search/route.ts` | Various German API error messages (e.g. "Upload fehlgeschlagen. Bitte erneut versuchen.", "Dokument nicht gefunden oder kein Zugriff.", "Tageslimit erreicht (...). Bitte morgen erneut versuchen.", "Anfrage ungültig (message und family_id erforderlich).", "Ein unerwarteter Fehler ist aufgetreten.", "Methode nicht erlaubt. Bitte POST verwenden.", etc.) — see section 13 for the full list |

---

## 7. Toast / Success Messages

| # | Text | File | Context |
|---|------|------|---------|
| 7.1 | `"Aufgabe erledigt ✓"` | `src/app/(app)/aufgaben/page.tsx` + `src/app/(app)/home/home-client.tsx` | Toast: task marked done |
| 7.2 | `"Aufgabe wieder geöffnet"` | `src/app/(app)/aufgaben/page.tsx` | Toast: task reopened |
| 7.3 | `"Aufgabe verworfen"` | `src/app/(app)/aufgaben/page.tsx` | Toast: task dismissed |
| 7.4 | `"Aufgabe gespeichert"` | `src/app/(app)/aufgaben/page.tsx` | Toast: task detail saved |
| 7.5 | `"Aufgabe gelöscht"` | `src/app/(app)/aufgaben/page.tsx` | Toast: task deleted via confirm sheet |
| 7.6 | `"Dokument gelöscht"` | `src/app/(app)/dokumente/page.tsx` | Toast: document deleted |
| 7.7 | `"{name} wurde hinzugefügt"` (template) | `src/app/(app)/familie/familie-client.tsx` | Toast: member added |
| 7.8 | `"Änderungen gespeichert"` | `src/app/(app)/familie/familie-client.tsx` | Toast: member edited |
| 7.9 | `"{name} wurde entfernt"` (template) | `src/app/(app)/familie/familie-client.tsx` | Toast: member removed |
| 7.10 | `"Gespeichert"` | `src/app/(app)/familie/einstellungen/settings-client.tsx` | Inline save-success indicator (family name) |

---

## 8. Status Text

| # | Text | File | Context |
|---|------|------|---------|
| 8.1 | `"Eingegangen"` | `src/lib/schemas/document.ts` | Status label: uploaded |
| 8.2 | `"Wird gelesen"` | `src/lib/schemas/document.ts` | Status label: ocr_processing |
| 8.3 | `"Gelesen"` | `src/lib/schemas/document.ts` | Status label: ocr_done |
| 8.4 | `"Wird verstanden"` | `src/lib/schemas/document.ts` | Status label: analyzing |
| 8.5 | `"Bereit zum Durchsehen"` | `src/lib/schemas/document.ts` | Status label: analyzed |
| 8.6 | `"Im Familienbuch"` | `src/lib/schemas/document.ts` | Status label: confirmed |
| 8.7 | `"Hat nicht geklappt"` | `src/lib/schemas/document.ts` | Status label: failed |
| 8.8 | `"Foto wird hochgeladen"` | `src/lib/schemas/document.ts` (PIPELINE_STEPS) | Pipeline step label (upload) — used in scan wizard + ReviewCardProcessing |
| 8.9 | `"Text wird erkannt"` | `src/lib/schemas/document.ts` (PIPELINE_STEPS) | Pipeline step label (ocr) |
| 8.10 | `"Inhalt wird verstanden"` | `src/lib/schemas/document.ts` (PIPELINE_STEPS) | Pipeline step label (analysis) |
| 8.11 | `"Ordilo schaut sich das an …"` | `src/components/ordilo/review-card/states.tsx` + `src/components/ordilo/scan-wizard/processing-step.tsx` | Processing state heading |
| 8.12 | `"Das dauert nur einen Moment."` | `src/components/ordilo/review-card/states.tsx` | Processing state subtitle |
| 8.13 | `"Im Familienbuch"` | `src/components/ordilo/review-card/states.tsx` | Confirmed state heading |
| 8.14 | `"Ist im Familienbuch und kann durchsucht werden."` | `src/components/ordilo/review-card/states.tsx` | Confirmed state subtitle |
| 8.15 | `"Wird hochgeladen … {progress}%"` (template) | `src/components/ordilo/scan-wizard/upload-progress.tsx` | Upload-progress status text |
| 8.16 | `"Wird gelesen …"` | `src/components/ordilo/scan-wizard/upload-progress.tsx` | Processing-phase status text |
| 8.17 | `"Wird gespeichert…"` | `src/components/ordilo/member-form.tsx` + `src/app/(app)/familie/einstellungen/settings-client.tsx` + `src/app/(app)/onboarding/onboarding-flow.tsx` | Submit button loading state (member/family/collection forms) |
| 8.18 | `"Wird abgeschlossen…"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Finish-onboarding button loading state |
| 8.19 | `"Wird entfernt…"` | `src/app/(app)/familie/familie-client.tsx` | Remove-member button loading state |
| 8.20 | `"Wird gelöscht…"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Delete-collection button loading state |
| 8.21 | `"Wird verschickt…"` | `src/app/(auth)/login/login-form.tsx` | Login submit button loading state |
| 8.22 | `"Wird gespeichert …"` | `src/components/ordilo/review-card/content.tsx` | Confirm button loading state (Review Card) |
| 8.23 | `"Wird bestätigt …"` | `src/components/ordilo/review-summary.tsx` | Confirm button loading state (Review Summary) |
| 8.24 | `"wird nochmal gelesen …"` | `src/components/ordilo/review-card/states.tsx` | Re-analyze button loading state (confirmed) |
| 8.25 | `"Erledigt"` / `"Offen"` / `"Verworfen"` | `src/components/ordilo/task-detail-sheet.tsx` | Task status text in detail sheet |
| 8.26 | `"{n}% KI"` (template) | `src/components/ordilo/task-detail-sheet.tsx` | Confidence indicator in task detail |
| 8.27 | `"Sehr relevant"` / `"Relevant"` / `"Möglich relevant"` | `src/components/ordilo/source-card.tsx` (getRelevanceLabel) | Source relevance badge labels |
| 8.28 | `"Hohe Zuverlässigkeit"` / `"Mittlere Zuverlässigkeit"` / `"Niedrige Zuverlässigkeit"` | `src/components/ordilo/confidence-badge.tsx` | Confidence badge aria-labels |
| 8.29 | `"bearbeitet"` | `src/components/ordilo/review-card/helpers.tsx` | Edited-entity tag label |
| 8.30 | `"Kamera wird gestartet …"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera permission-requesting state |
| 8.31 | `"Dokument im Rahmen ausrichten"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera viewfinder helper text |
| 8.32 | `"Kein Zugriff auf die Kamera"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera denied heading |
| 8.33 | `"Kamera nicht verfügbar"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera unavailable heading |
| 8.34 | `"Bitte erlaube den Kamerazugriff in den Browser-Einstellungen, oder wähle ein Foto aus der Galerie."` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera denied description |
| 8.35 | `"Dieses Gerät oder dieser Browser unterstützt die Kamera hier nicht. Wähle stattdessen ein Foto oder eine PDF-Datei aus."` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera unavailable description |
| 8.36 | `"Heute"` / `"Gestern"` / `"Diese Woche"` / `"Früher"` | `src/app/(app)/suche/suche-client.tsx` | Chat history group labels |
| 8.37 | `"Neuer Chat"` | `src/app/(app)/suche/suche-client.tsx` | Chat list fallback title (no title) + header default |
| 8.38 | `"Dokumenten-Suche"` | `src/components/ordilo/source-card.tsx` + `src/app/(app)/suche/message-bubble.tsx` | Default source-kind label |
| 8.39 | `"Aufgaben-Suche"` | `src/app/(app)/suche/message-bubble.tsx` | Source-kind label (task-derived) |
| 8.40 | `"Personen-Suche"` | `src/app/(app)/suche/message-bubble.tsx` | Source-kind label (person-derived) |

---

## 9. Onboarding Flow

| # | Text | File | Context |
|---|------|------|---------|
| 9.1 | `"Hallo! Schön, dass du da bist. Ich bin Ordilo und helfe dir, eure Familienunterlagen ordentlich zu halten. Wie heißt eure Familie?"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Initial AI welcome message |
| 9.2 | `"Wie heißt eure Familie?"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | AI prompt (family name) |
| 9.3 | `"Schön, {familyName}! Wen möchtest du als Erstes anlegen?"` (template) | `src/app/(app)/onboarding/onboarding-flow.tsx` | AI prompt after family created (initial + resume) |
| 9.4 | `"Wen möchtest du noch anlegen?"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | AI prompt (add another) |
| 9.5 | `"{memberName} wurde hinzugefügt."` (template) | `src/app/(app)/onboarding/onboarding-flow.tsx` | AI confirmation after member added |
| 9.6 | `"Möchtest du noch jemanden anlegen?"` | `src/app/(app)/onboarding/onboarding-flow.tsx` | Choose-next step prompt |
| 9.7 | `"Bisher hinzugefügt:"` / `"Bisher hinzugefügt ({n}):"` (template) | `src/app/(app)/onboarding/onboarding-flow.tsx` | Running member-list caption |
| 9.8 | `"Das hat nicht geklappt. Bitte versuch's nochmal."` | `src/app/(app)/onboarding/onboarding-flow.tsx` (NETWORK_ERROR) | Onboarding network error banner |
| 9.9 | `"Etwas ist schiefgelaufen. Bitte versuche es erneut."` | `src/app/(app)/onboarding/onboarding-flow.tsx` (missing familyId guard) | Onboarding guard error |

---

## 10. Navigation

| # | Text | File | Context |
|---|------|------|---------|
| 10.1 | `"Dokumente"` | `src/components/ordilo/app-shell.tsx` (NAV_TABS) | Nav tab label → /dokumente |
| 10.2 | `"Fragen"` | `src/components/ordilo/app-shell.tsx` (NAV_TABS) | Nav tab label → /suche |
| 10.3 | `"Familie"` | `src/components/ordilo/app-shell.tsx` (NAV_TABS) | Nav tab label → /familie + sidebar footer dropdown item |
| 10.4 | `"Aufgaben"` | `src/components/ordilo/app-shell.tsx` (NAV_TABS) | Nav tab label → /aufgaben |
| 10.5 | `"Abmelden"` | `src/components/ordilo/app-shell.tsx` | Logout button (mobile drawer + sidebar footer dropdown + no-profile fallback) |
| 10.6 | `"Ordilo"` | `src/components/ordilo/app-shell.tsx` | Wordmark (mobile topbar + sidebar) |
| 10.7 | `"Sammlung hinzufügen"` | `src/components/ordilo/app-shell.tsx` | Sidebar add-collection button (collapsed title) |
| 10.8 | `"Seitenleiste ausklappen"` / `"Seitenleiste einklappen"` | `src/components/ordilo/app-shell.tsx` | Sidebar collapse toggle aria-labels |
| 10.9 | Time-of-day greetings: `"Guten Morgen"`, `"Guten Tag"`, `"Guten Abend"`, `"Gute Nacht"` | `src/components/ordilo/app-shell.tsx` (getGreeting) + `src/app/(app)/familie/familie-client.tsx` (getGreeting) + `src/app/(app)/home/page.tsx` (getGreeting) | Sidebar greeting / family banner greeting / home greeting |
| 10.10 | Default collection names: `"Rechnungen"`, `"Schule"`, `"Verträge"`, `"Gesundheit"`, `"Unterlagen"` | `src/lib/schemas/collections.ts` (DEFAULT_COLLECTIONS) | Seeded sidebar collections after onboarding |
| 10.11 | Collection icon aria-labels: `"Dokument"`, `"Rechnung"`, `"Gebäude"`, `"Vertrag"`, `"Gesundheit"`, `"Schule"`, `"Auto"`, `"Zuhause"`, `"Arbeit"`, `"Finanzen"` | `src/lib/schemas/collections.ts` (COLLECTION_ICON_OPTIONS) | Icon-picker button aria-labels |
| 10.12 | Collection color aria-labels: `"Petrol"`, `"Apricot"`, `"Rot"`, `"Blau"`, `"Grau"`, `"Sand"` | `src/lib/schemas/collections.ts` (COLLECTION_COLOR_OPTIONS) | Color-picker button aria-labels |
| 10.13 | Document type labels: `"Rechnung"`, `"Brief"`, `"Vertrag"`, `"Arztbrief"`, `"Schule"`, `"Versicherung"`, `"Steuer"`, `"Sonstiges"` | `src/lib/schemas/extraction.ts` (DOCUMENT_TYPE_LABELS) | Document-type badges + table type column + answer-card + filter options |
| 10.14 | `"+ Eigene Kategorie …"` | `src/components/ordilo/review-card/edit-controls.tsx` | Category-select "add own" option |

---

## 11. Chat / AI

| # | Text | File | Context |
|---|------|------|---------|
| 11.1 | Example queries: `"Zeig mir alle Dokumente von Emma"`, `"Welche Fristen laufen bald ab?"`, `"Finde die letzte Stromrechnung"`, `"Was muss ich diese Woche erledigen?"` | `src/app/(app)/suche/suche-client.tsx` (EXAMPLE_QUERIES) | Suche empty-state example query buttons |
| 11.2 | Processing checklist header phrases: `"Ordilo denkt nach"`, `"Suche in deinen Unterlagen"`, `"Prüfe deine Dokumente"`, `"Ermittle die beste Antwort"` | `src/app/(app)/suche/processing-checklist.tsx` (HEADER_PHRASES) | Rotating header above processing steps |
| 11.3 | Processing checklist step sets (6 sets of 4 steps each): `["Verstehe deine Frage", "Durchsuche Dokumente", "Prüfe Aufgaben und Fristen", "Ermittle Antwort"]`, `["Lass mich darüber nachdenken…", "Stöbere in deinen Unterlagen", "Schau nach offenen Aufgaben", "Formuliere Antwort"]`, `["Fasse deine Frage zusammen", "Suche passende Dokumente", "Prüfe Fristen und Termine", "Schreibe Antwort"]`, `["Hm, gute Frage", "Blättere durch deine Akten", "Gucke nach, was ansteht", "Fast fertig…"]`, `["Analysiere, was du brauchst", "Durchsuche deine Dokumente", "Prüfe Aufgaben und Kalender", "Stelle Antwort zusammen"]`, `["Sammle Kontext", "Suche in deinem Archiv", "Ordne Fristen und ToDos", "Ermittle Antwort"]` | `src/app/(app)/suche/processing-checklist.tsx` (STEP_SETS) | Processing checklist step labels (randomly selected) |
| 11.4 | Tool-call status labels: `"Durchsuche Dokumente…"`, `"Aufgaben werden geladen…"`, `"Familienmitglieder werden geladen…"`, `"Aufgabe wird erledigt…"` | `src/app/(app)/suche/message-bubble.tsx` (TOOL_LABELS) | Inline tool-call status indicators |
| 11.5 | `"Arbeitet…"` | `src/app/(app)/suche/message-bubble.tsx` | Fallback tool-call status label |
| 11.6 | Answer-card action labels: `"Zum Termin"`, `"Zur Aufgabe"`, `"Zum Dokument"` (×2 fallback) | `src/components/ordilo/answer-card.tsx` (CARD_TYPE_ACTION_LABEL) | Answer-card action button labels |
| 11.7 | Analysis headline template: `"Ich glaube, das ist {article} {typeLabel} für {name}"` / `"Ich glaube, das ist {article} {typeLabel}: {title}"` / `"Ich glaube, das ist {article} {typeLabel}"` | `src/components/ordilo/review-card/helpers.tsx` (buildHeadline) | Review Card + Review Summary headline |
| 11.8 | Review-summary auto-action templates: `"Dokument bei {name} speichern"` / `"Dokument im Familienbuch speichern"`, `"Aufgabe \"{title}\" erstellen"`, `"{n} Aufgaben erstellen"`, `"Erinnerung am {date}"`, `"Tag \"{category}\" hinzufügen"` | `src/components/ordilo/review-summary.tsx` (buildAutoActions) | Auto-action list items |
| 11.9 | Review-summary highlight captions: `"Person"`, `"Organisation"`, `"Wichtiger Inhalt"`, `"Frist erkannt"` + role name fallback | `src/components/ordilo/review-summary.tsx` (buildHighlights) | Highlight row captions |
| 11.10 | `"Unbenanntes Dokument"` | `src/components/ordilo/source-card.tsx` + `src/components/ordilo/source-match-card.tsx` | Source card title fallback |
| 11.11 | `"Dokument"` (fallback) | `src/components/ordilo/document-card.tsx` + `src/app/(app)/home/home-client.tsx` + `src/components/ordilo/document-detail-sheet.tsx` | Document title fallback (no title/filename) |
| 11.12 | `"Ohne Titel"` | `src/components/ordilo/task-card.tsx` + `src/components/ordilo/task-detail-sheet.tsx` | Linked-document title fallback |
| 11.13 | `"Zum Dokument"` | `src/components/ordilo/task-card.tsx` | sr-only document link fallback text |
| 11.14 | `"Neuer Chat"` | `src/app/(app)/suche/suche-client.tsx` | Chat header default title + chat-list item fallback |

---

## 12. Confirmation Dialogs

| # | Text | File | Context |
|---|------|------|---------|
| 12.1 | `"Aufgabe löschen?"` | `src/app/(app)/aufgaben/page.tsx` | Delete-task sheet title |
| 12.2 | `"Die Aufgabe wird dauerhaft entfernt."` | `src/app/(app)/aufgaben/page.tsx` | Delete-task sheet description |
| 12.3 | `"Dokument löschen?"` | `src/app/(app)/dokumente/page.tsx` | Delete-document sheet title |
| 12.4 | `"Das Dokument wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden."` | `src/app/(app)/dokumente/page.tsx` | Delete-document sheet description |
| 12.5 | `"Person entfernen"` | `src/app/(app)/familie/familie-client.tsx` | Remove-member dialog title |
| 12.6 | `"Möchtest du {name} wirklich entfernen?"` (template) | `src/app/(app)/familie/familie-client.tsx` | Remove-member dialog description |
| 12.7 | `"Sammlung löschen"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Delete-collection dialog title |
| 12.8 | `"Möchtest du {name} wirklich löschen? Keine Sorge, die Dokumente bleiben erhalten."` (template) | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Delete-collection dialog description |

---

## 13. API Route Error Strings (surfaced via fetch failures)

These German error strings live in API route handlers and are surfaced to
the user when the client fetches them (e.g. ReviewCard confirm/reanalyze,
chat, search, upload).

| # | Text | File | Context |
|---|------|------|---------|
| 13.1 | `"Ungültige Anfrage. Bitte eine Datei hochladen."` | `src/app/api/documents/upload/route.ts` | Upload: no file in formData |
| 13.2 | `"Keine Datei gefunden. Bitte eine Datei auswählen."` | `src/app/api/documents/upload/route.ts` | Upload: empty file field |
| 13.3 | `"Ungültige Familien-ID."` | `src/app/api/documents/upload/route.ts` | Upload: bad family_id |
| 13.4 | `"Datei konnte nicht gelesen werden. Bitte erneut versuchen."` | `src/app/api/documents/upload/route.ts` | Upload: file read error |
| 13.5 | `"Kein Zugriff auf diese Familie."` | `src/app/api/documents/upload/route.ts` | Upload: family ownership check |
| 13.6 | `"Upload fehlgeschlagen. Bitte erneut versuchen."` | `src/app/api/documents/upload/route.ts` | Upload: storage insert error |
| 13.7 | `"Dokument konnte nicht gespeichert werden. Bitte erneut versuchen."` | `src/app/api/documents/upload/route.ts` | Upload: DB insert error |
| 13.8 | `"Methode nicht erlaubt. Bitte POST verwenden."` | `src/app/api/documents/upload/route.ts` (and other routes) | Wrong HTTP method |
| 13.9 | `"OCR-Text konnte nicht geladen werden."` | `src/app/api/documents/[id]/analyze/route.ts` (+ confirm route) | Analyze/confirm: OCR fetch error |
| 13.10 | `"Kein OCR-Text vorhanden. Bitte zuerst OCR durchführen."` | `src/app/api/documents/[id]/analyze/route.ts` | Analyze: no OCR text |
| 13.11 | `"Status konnte nicht aktualisiert werden."` | `src/app/api/documents/[id]/analyze/route.ts` (+ ocr route) | Analyze/OCR: status update error |
| 13.12 | `"Der Dokument-Status hat sich geändert. Bitte erneut versuchen."` | `src/app/api/documents/[id]/analyze/route.ts` (+ confirm route) | Analyze/confirm: stale status |
| 13.13 | `"Dokument-Status konnte nicht aktualisiert werden."` | `src/app/api/documents/[id]/analyze/route.ts` | Analyze: final status update error |
| 13.14 | `"Ungültige Dokument-ID."` | `src/app/api/documents/[id]/ocr/route.ts` | OCR: bad document id |
| 13.15 | `"Dokument nicht gefunden oder kein Zugriff."` | `src/app/api/documents/[id]/ocr/route.ts` | OCR: document missing |
| 13.16 | `"Payload konnte nicht gelesen werden."` | `src/app/api/documents/[id]/confirm/route.ts` | Confirm: bad JSON body |
| 13.17 | `"Datei konnte nicht geladen werden."` | `src/app/api/documents/[id]/file/route.ts` | File: signed URL error |
| 13.18 | `"Anfrage ungültig (message und family_id erforderlich)."` | `src/app/api/chat/route.ts` | Chat: missing fields |
| 13.19 | `"Anfrage konnte nicht gelesen werden."` | `src/app/api/chat/route.ts` (+ chat/feedback + search) | Chat/feedback/search: bad JSON |
| 13.20 | `"Tageslimit erreicht ({used} Nachrichten heute). Bitte morgen erneut versuchen."` (template) | `src/app/api/chat/route.ts` | Chat: rate limit (429) |
| 13.21 | `"Ein unerwarteter Fehler ist aufgetreten."` | `src/app/api/chat/route.ts` | Chat: catch-all error |
| 13.22 | `"Konversation konnte nicht gelöscht werden."` | `src/app/api/conversations/[id]/route.ts` | Conversation delete error |
| 13.23 | `"Titel erforderlich."` | `src/app/api/conversations/[id]/route.ts` | Conversation rename: empty title |
| 13.24 | `"Titel konnte nicht aktualisiert werden."` | `src/app/api/conversations/[id]/route.ts` | Conversation rename: DB error |
| 13.25 | `"Feedback konnte nicht gespeichert werden."` | `src/app/api/chat/feedback/route.ts` | Feedback: DB error |
| 13.26 | `"Suchanfrage ungültig (query, family_id und mode erforderlich)."` | `src/app/api/search/route.ts` | Search: missing fields |
| 13.27 | `"Nicht authentifiziert."` | `src/app/api/chat/__tests__/route.test.ts` (test fixture) | Chat: unauthorized (test) |

---

## 14. Additional aria-labels (screen-reader-only text)

These are not visually rendered but are user-facing for assistive tech.

| # | Text | File | Context |
|---|------|------|---------|
| 14.1 | `"Menü öffnen"` | `src/components/ordilo/app-shell.tsx` | Mobile hamburger aria-label |
| 14.2 | `"Ordilo Startseite"` | `src/components/ordilo/app-shell.tsx` | Wordmark link aria-label (×3) |
| 14.3 | `"Hauptnavigation"` | `src/components/ordilo/app-shell.tsx` | Sidebar + drawer nav aria-label |
| 14.4 | `"Aktionen"` | `src/components/ordilo/card-actions.tsx` + `src/app/(app)/familie/familie-client.tsx` | Card actions menu trigger aria-label |
| 14.5 | `"Bearbeiten"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Collection edit button aria-label |
| 14.6 | `"Sammlung löschen"` | `src/app/(app)/sammlungen/[id]/collection-client.tsx` | Collection delete button aria-label |
| 14.7 | `"Nochmal versuchen"` | `src/components/ordilo/document-card.tsx` + `src/components/ordilo/scan-wizard/upload-progress.tsx` | Retry button aria-labels |
| 14.8 | `"Schließen"` | `src/components/ordilo/scan-wizard/scan-wizard.tsx` + `processing-step.tsx` + `upload-progress.tsx` | Close button aria-labels |
| 14.9 | `"Kamera schließen"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Camera close aria-label |
| 14.10 | `"Blitz ausschalten"` / `"Blitz einschalten"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Torch toggle aria-labels |
| 14.11 | `"Aus Galerie wählen"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Gallery button aria-label (×2) |
| 14.12 | `"Foto aufnehmen"` | `src/components/ordilo/scan-wizard/camera-step.tsx` | Shutter button aria-label |
| 14.13 | `"Dokument scannen"` | `src/components/ordilo/scan-wizard/scan-wizard.tsx` | Scan wizard dialog aria-label |
| 14.14 | `"Foto oder PDF aus der Galerie wählen"` | `src/lib/scan/scan-context.tsx` | Hidden gallery file input aria-label |
| 14.15 | `"Foto mit Kamera aufnehmen"` | `src/app/(app)/dokumente/page.tsx` | Hidden camera input aria-label |
| 14.16 | `"PDF oder Bild hochladen"` | `src/app/(app)/dokumente/page.tsx` | Hidden PDF input aria-label |
| 14.17 | `"Dokument suchen"` | `src/app/(app)/dokumente/page.tsx` | Search input aria-label |
| 14.18 | `"Suche löschen"` | `src/app/(app)/dokumente/page.tsx` | Clear-search button aria-label |
| 14.19 | `"Ansicht wählen"` | `src/app/(app)/dokumente/page.tsx` | View-toggle tablist aria-label |
| 14.20 | `"Sortieren nach {Datum/Titel/Typ}"` (template) | `src/app/(app)/dokumente/page.tsx` | Sort-button aria-label |
| 14.21 | `"Dokumente durchsuchen"` | `src/components/ordilo/documents-table.tsx` | Table search aria-label |
| 14.22 | `"Nach Person filtern"` / `"Nach Typ filtern"` / `"Nach Kategorie filtern"` / `"Nach Tag filtern"` | `src/components/ordilo/documents-table.tsx` | Filter select aria-labels |
| 14.23 | `"Datum von"` / `"Datum bis"` | `src/components/ordilo/documents-table.tsx` | Date filter aria-labels |
| 14.24 | `"Vorherige Seite"` / `"Nächste Seite"` | `src/components/ordilo/documents-table.tsx` | Pagination button aria-labels |
| 14.25 | `"Aufgaben werden geladen"` | `src/app/(app)/aufgaben/page.tsx` | Loading skeleton aria-label |
| 14.26 | `"Familie"` | `src/app/(app)/home/home-client.tsx` | Member-list link aria-label |
| 14.27 | `"{name} öffnen"` (template) | `src/app/(app)/familie/familie-client.tsx` + `src/components/ordilo/person-card.tsx` | Member row button aria-label |
| 14.28 | `"Aufgabe als offen markieren"` / `"Aufgabe als erledigt markieren"` | `src/components/ordilo/task-card.tsx` | Task checkbox aria-labels |
| 14.29 | `"Aufgabe verwerfen"` | `src/components/ordilo/task-detail-sheet.tsx` | Task dismiss button aria-label |
| 14.30 | `"Aufgabe löschen"` | `src/components/ordilo/review-card/content.tsx` | Review task delete button aria-label |
| 14.31 | `"Person wechseln"` / `"Kategorie wechseln"` / `"Kategorie eingeben"` / `"Zurück zur Auswahl"` | `src/components/ordilo/review-card/edit-controls.tsx` | Edit-control aria-labels |
| 14.32 | `"Priorität"` | `src/components/ordilo/task-detail-sheet.tsx` | Priority radiogroup aria-label |
| 14.33 | `"{label} bearbeiten"` (template, e.g. "Frist bearbeiten") | `src/components/ordilo/review-card/edit-controls.tsx` | Date edit button aria-label |
| 14.34 | `"Such- und Chat-Eingabe"` | `src/components/ordilo/ai-search-bar.tsx` | Search bar textarea aria-label |
| 14.35 | `"Senden"` | `src/components/ordilo/ai-search-bar.tsx` | Search bar send button aria-label |
| 14.36 | `"Chat-Historie öffnen"` | `src/app/(app)/suche/suche-client.tsx` | Chat history toggle aria-label |
| 14.37 | `"Neuer Chat"` | `src/app/(app)/suche/suche-client.tsx` | New chat button aria-label |
| 14.38 | `"Konversation"` | `src/app/(app)/suche/suche-client.tsx` | Messages container aria-label |
| 14.39 | `"Chat löschen"` | `src/app/(app)/suche/suche-client.tsx` | Chat list delete button aria-label |
| 14.40 | `"Antwort war hilfreich"` / `"Antwort war nicht hilfreich"` / `"Antwort kopieren"` | `src/app/(app)/suche/message-bubble.tsx` | Feedback button aria-labels |
| 14.41 | `"Filter zurücksetzen"` | `src/app/(app)/suche/filter-chips.tsx` | Clear-filters aria-label |
| 14.42 | `"Ordilo denkt nach"` | `src/app/(app)/suche/processing-checklist.tsx` | Processing checklist aria-label |
| 14.43 | `"Farbe {color} auswählen"` (template) | `src/app/(app)/onboarding/onboarding-flow.tsx` + `src/components/ordilo/member-form.tsx` | Avatar color button aria-labels |
| 14.44 | Birthday cake `title` attributes: `"Heute Geburtstag"`, `"Morgen Geburtstag"`, `"In {n} Tagen Geburtstag"` (template) | `src/components/ordilo/person-card.tsx` | Person card birthday indicator titles |

---

## 15. Metadata / Document head

| # | Text | File | Context |
|---|------|------|---------|
| 15.1 | `"Ordilo"` (title) | `src/app/layout.tsx` | HTML document title |
| 15.2 | `"Dein privater AI-Familienordner. Erfasse, verstehe und durchsuche Dokumente auf natürliche Weise."` | `src/app/layout.tsx` | Meta description |

---

## Notes

- All UI copy is in German, consistent with the DESIGN.md "German-language UI
  copy, plain and accessible" requirement.
- The app uses dynamic templates (e.g. `"{name} wurde hinzugefügt"`) for
  many toast messages and headlines — these are marked with `(template)`
  in the table.
- Several strings appear in multiple files (e.g. `"Abbrechen"`, `"Löschen"`,
  `"Speichern"`, `"Nochmal versuchen"`, `"Etwas ist schiefgelaufen. Bitte
  erneut versuchen."`) — these are listed per file occurrence.
- API route error strings (section 13) are surfaced to users indirectly via
  fetch error handling in client components (e.g. ReviewCard confirm/reanalyze
  catch handlers, chat error bubble).
- The `src/components/ui/*` shadcn-style primitives (button, dialog, sheet,
  etc.) contain no German copy themselves — all text is passed as props or
  children by the calling Ordilo components.
- Test files (`__tests__/`) were excluded from this inventory except where a
  test fixture string (13.27) is the only documented occurrence of a real
  API error message.
