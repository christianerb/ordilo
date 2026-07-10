# Agent Guidelines

## Git-Workflow

- **Nie direkt auf `main` committen oder pushen.** Immer einen Feature-Branch erstellen (`feature/...`, `fix/...`, `docs/...`), pushen, und einen PR aufmachen.
- **Branch-Naming**: `feature/<kurz>`, `fix/<kurz>`, `docs/<kurz>`, `refactor/<kurz>`.
- **PR-Titel** auf Englisch oder Deutsch, kurz und beschreibend.
- **Squash-Merge** als Standard, Branch nach Merge löschen.
- Vor jedem Commit: `git diff --cached` prüfen, besonders auf Secrets oder `.env`-Dateien.
- Commit-Message im Imperativ, englisch, mit `Co-authored-by` falls Droid.

## Qualität & CI

- Vor jedem PR lokal prüfen:
  ```bash
  npm run lint && npm run typecheck && npm run test && npm run build
  ```
- CI muss grün sein vor Merge (Lint, Typecheck, Unit Tests, Build).
- Neue Features brauchen Tests (Vitest, gleicher Stil wie bestehende Tests).

## Supabase-Migrationen

- SQL-Migrationen leben in `supabase/migrations/`, nummeriert (`00NN_name.sql`).
- Migrationen müssen **idempotent** sein (`add column if not exists`, `on conflict do nothing`) damit sie sicher erneut ausgeführt werden können.
- Nie manuell Schema-Änderungen im Supabase Dashboard machen - immer eine Migration-Datei erstellen.
- Migrationen lokal mit `supabase db push --dry-run` testen, dann pushen.
- Im PR beschreiben, was die Migration ändert.

## Secrets

- `.env.local` wird nie committet (steht in `.gitignore`).
- API-Keys, Passwörter, Tokens niemals in Code, Commits, oder Logs.
- GitHub Secrets für CI/CD über Repo Settings → Secrets and variables → Actions.

## Code-Konventionen

- **Sprache**: UI-Copy auf Deutsch (Hauptschul-Niveau, nicht-bürokratisch). Code-Kommentare und Commit-Messages auf Englisch.
- **Design-System**: `DESIGN.md` befolgen - Farben, Radii, Schatten, Typografie.
- **TypeScript**: Strict mode, keine `any` ohne Begründung.
- **Komponenten**: shadcn/ui + Radix UI als Basis. Eigene Komponenten unter `src/components/ordilo/`.
- **Schemas**: Zod für Validierung (Server und Client), siehe `src/lib/schemas/`.
- **Supabase-Clients**: Browser-Client über `@/lib/supabase/client`, Server-Client über `@/lib/supabase/server`, Admin-Client über `@/lib/supabase/admin` (nur in API Routes, nie im Client).
- **Keine Server-Secrets im Client**: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `DATALAB_API_KEY` dürfen nie im Browser-Code erscheinen.

## PR-Checklist

- [ ] CI ist grün
- [ ] Keine Secrets oder `.env`-Dateien committet
- [ ] German UI-Copy geprüft (Hauptschul-Niveau, nicht-bürokratisch)
- [ ] Design-System-Regeln eingehalten (DESIGN.md)
- [ ] Neue Migrationen idempotent und im PR beschrieben
- [ ] Tests für neue Features geschrieben
