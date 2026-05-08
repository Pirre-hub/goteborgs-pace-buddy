# Pirrecoachen v2 – fyra nya beslutsstöd

Fyra sammanhängande funktioner som förvandlar appen från en Strava-spegling till en aktiv coach. Allt körs på data du redan har + Lovable AI + Strava webhooks. Inga nya betal-API:er.

---

## 1. Form-peak (Banister Fitness-Fatigue / TSB)

**Vad du ser:** En graf över 90 dagar med tre linjer:
- **CTL** (form/uthållighet) – 42-dagars rullande träningsbelastning
- **ATL** (trötthet) – 7-dagars rullande belastning  
- **TSB** (form = CTL − ATL) – när TSB är positiv är du utvilad

Plus en stor siffra: **"Din topp-form infaller ~14 maj. Tapering bör starta 11 maj."**

**Hur det räknas:**
- Per pass beräknas TSS (Training Stress Score) via rTSS-formeln: `(sek × NGP² / FTPace²) × 100/3600`. Tröskeltempo (FTPace) härleds från ditt `goal_pace_sec` × 1.06.
- Daglig TSS aggregeras till `training_load`-tabell, CTL/ATL/TSB beräknas med exponentiella medelvärden.
- Peak-datum predikteras genom att projicera nuvarande träning framåt mot lopp-datum och hitta dag då TSB först blir +5 till +25 (idealfönster).

---

## 2. Pace-DNA (din löparprofil)

**Vad du ser:** En kort, personlig sammanfattning på 4–6 bullets, t.ex.:
- *"Du är 8% snabbare på morgonpass än kvällspass"*
- *"Din puls driftar +12 slag efter 60 min – uthållighetsträning saknas"*
- *"På pass över 12 km tappar du 14 sek/km efter halva sträckan (positiv split)"*
- *"Söndagar = dina starkaste pass. Lägg långpasset där."*
- *"Backar (>4% lutning) drar 18% mer än flack mark – mer än genomsnitt"*

**Hur:** Server function hämtar detalj-data (splits, höjdmeter, puls per km) från Strava `/activities/{id}` för dina 30 senaste pass, cachar i ny `strava_activities`-tabell. En AI-analys (Lovable AI, Gemini Flash) får all data och returnerar 4–6 evidensbaserade insikter på svenska. Cachas 24h.

---

## 3. Auto-refresh via Strava webhook

**Vad du märker:** När du laddar upp ett pass i Strava syns det i Pirrecoachen direkt – ingen 5-minuters cache, ingen omladdning.

**Hur:**
- Ny offentlig endpoint `/api/public/strava-webhook` hanterar Stravas `GET` (verifierings-challenge) och `POST` (aktivitets-event).
- Vid event: hämta aktiviteten från Strava, spara i `strava_activities`, räkna om dagens TSS, uppdatera `strava_sync.last_event_at`.
- Frontend prenumererar via Supabase Realtime på `strava_sync` → vid ändring invalideras React Query → fräsch data utan refresh.
- En engångs-knapp i Inställningar: "Aktivera webhook" → registrerar prenumeration hos Strava (`POST /push_subscriptions`).

---

## 4. Dagens briefing (pre-pass push + dashboard-kort)

**Vad du ser varje morgon kl 06:30:**

> Push-notis: *"🏃 Idag: Tröskelpass 5×6 min @ 5:35/km. Du är utvilad (TSB +8). Värm upp 15 min."*

Samma text finns alltid i ett "Dagens briefing"-kort högst upp på dashboarden.

**Hur:**
- pg_cron körs 06:30 dagligen → anropar `/api/public/cron/daily-briefing`.
- Endpoint: läs aktivt mål, senaste 7 pass, dagens CTL/ATL/TSB, väderprognos från SMHI för Göteborg → AI genererar dagens råd på svenska → spara i `briefings`-tabell → skicka web push till alla prenumeranter.
- Web push: VAPID-baserad, opt-in via knapp i Inställningar. Service worker registreras i appen.

---

## Tekniska detaljer

### Nya tabeller
- **strava_activities**: full aktivitetscache (id, distance, moving_time, start_date, average_heartrate, total_elevation_gain, splits jsonb, raw jsonb)
- **training_load**: per dag (date PK, daily_tss, ctl, atl, tsb)
- **strava_sync**: webhook-status (id=1, last_event_at, subscription_id)
- **pace_dna**: cachad AI-analys (id=1, insights jsonb, computed_at)
- **briefings**: dagliga råd (date PK, content text, workout jsonb)
- **push_subscriptions**: web push endpoints (id, endpoint, p256dh, auth, created_at)

Alla saknar RLS-användarkontext (single-user-app, samma mönster som befintliga `strava_tokens` och `race_goal`).

### Nya filer
- `src/lib/training.functions.ts` + `training.server.ts` – CTL/ATL/TSB-beräkning, rTSS
- `src/lib/dna.functions.ts` + `dna.server.ts` – AI-analys av Pace-DNA
- `src/lib/briefing.functions.ts` + `briefing.server.ts` – dagens briefing-läsning
- `src/lib/push.functions.ts` + `push.server.ts` – VAPID push-registrering & sändning
- `src/lib/strava.server.ts` – utöka med `fetchActivityDetail`, `registerWebhook`, `syncActivity`
- `src/routes/api/public/strava-webhook.ts` – webhook-mottagare
- `src/routes/api/public/cron/daily-briefing.ts` – cron-trigger
- `src/components/TrainingLoadChart.tsx`, `PaceDNACard.tsx`, `DailyBriefingCard.tsx`
- `public/sw.js` – service worker för push

### Strava extra-anrop
- `/activities/{id}` per nytt pass (hämtas via webhook eller engångs-backfill när Pace-DNA körs första gången) – väl inom Stravas rate limit (100/15min, 1000/dygn).

### Secrets som behövs
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` – genereras automatiskt vid migration via Web Crypto, sparas som secrets.

### Risker / öppna punkter
- **Web push i Worker-runtime**: standard `web-push`-paketet är Node-tungt. Använder ren Web Crypto + manuell VAPID-implementation (ca 80 rader, fungerar i Cloudflare Workers).
- **Strava webhook-registrering**: kräver att appen redan är publicerad på en stabil URL (`project--{id}.lovable.app`) – fungerar i preview men Strava kan vara petig med dev-URLer. Plan B: kortare React Query staleTime (30 sek) som fallback.
- **Backfill vid första körning**: Pace-DNA + form-peak behöver historisk data. Första körningen tar ~1 min för att hämta detaljer för 30 pass.

### Vad som INTE bygges nu
- ACWR-belastningsvarning (#1) – TSB täcker mycket av samma nytta
- Realistisk sluttidsprognos (#2) – kan läggas till senare som påbyggnad på training_load
- 80/20-fördelning (#3), väderjustering (#4 – delvis i briefing), PR-tracker (#6), adaptiv plan (#7)
