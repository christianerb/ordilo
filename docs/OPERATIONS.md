# Betrieb — Aktivierungs-Checkliste

Alles hier ist gebaut, getestet und env-gated: ohne die genannten
Umgebungsvariablen ist das jeweilige Feature schlicht aus (Endpoints
antworten 503, niemals offen). Aktivierung = Env-Variablen in Vercel
setzen, deployen, fertig.

## 1. Reminder-Digest (tägliche Fristen-E-Mail)

Ein Cron (siehe `vercel.json`, täglich 06:00 UTC = 08:00 MESZ) ruft
`GET /api/digest/run` auf. Für jede Familie mit überfälligen oder in den
nächsten 7 Tagen fälligen Aufgaben bekommt jedes Mitglied eine deutsche
E-Mail (eine pro Empfänger — niemand sieht fremde Adressen). Familien
ohne Fristen bekommen nichts.

| Variable | Pflicht | Beschreibung |
| --- | --- | --- |
| `CRON_SECRET` | ja | Vercel sendet es automatisch als Bearer-Token an Cron-Pfade. Beliebiger langer Zufallswert. |
| `RESEND_API_KEY` | ja | API-Key von [resend.com](https://resend.com). Ohne Key: 503, kein Versand. |
| `DIGEST_FROM_EMAIL` | empfohlen | Absender, z. B. `Ordilo <hallo@ordilo.de>` (Domain bei Resend verifizieren). Default ist Resends Sandbox-Absender. |
| `APP_BASE_URL` | empfohlen | Absolute App-URL für Links in der Mail, z. B. `https://app.ordilo.de`. Fallback: Request-Origin. |

Hinweis: Läufe werden nicht dedupliziert — der Cron feuert 1×/Tag, ein
manueller zweiter Aufruf verschickt den Digest erneut.

## 2. Async-Pipeline (Scan-Verarbeitung über die Job-Queue)

Die gesamte Infrastruktur (Queue `processing_jobs`, Claim-RPC, Worker
`/api/jobs/run`) ist deployt; die Pipeline läuft aber noch synchron.

Aktivierung:

1. `PIPELINE_MODE=async` setzen.
2. `JOBS_RUNNER_SECRET` setzen (oder `CRON_SECRET` mitverwenden — der
   Worker akzeptiert beide).
3. Einen Scheduler auf `GET /api/jobs/run` zeigen lassen. Auf einem
   Vercel-Pro-Plan als zweiten Cron-Eintrag in `vercel.json`
   (z. B. `*/1 * * * *`); auf dem Hobby-Plan (max. 1 Cron/Tag) besser
   pg_cron + pg_net in Supabase oder ein externer Scheduler.

Der Worker ist idempotent und nebenläufigkeitssicher (FOR UPDATE SKIP
LOCKED) — häufiges Aufrufen ist billig.

## 3. E2E-Smoke-Tests

Laufen automatisch in CI (Job „E2E Smoke"): gebaute App booten,
Login-Redirect, Login-Formular, PWA-Manifest + Icons. Lokal:

```bash
npm run build        # Placeholder-Envs genügen, siehe ci.yml
npm run test:e2e     # PW_CHROMIUM_PATH überschreibt den Browser-Pfad
```

## 4. Bewusst offen (Entscheidung nötig)

- **Sentry / Error-Tracking:** bewusst noch nicht eingebaut — das SDK
  kostet Cold-Start-Zeit und braucht ein DSN. Wenn gewünscht:
  `@sentry/nextjs` mit `SENTRY_DSN`, tracesSampleRate niedrig halten.
- **Vercel ↔ Supabase Region:** prüfen, dass die Vercel-Functions-Region
  (Projekt-Settings) bei der Supabase-Region (z. B. `eu-central-1`)
  liegt — jeder Query zahlt sonst Interkontinental-Latenz.
