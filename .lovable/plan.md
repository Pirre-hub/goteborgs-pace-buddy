
## Ny disposition (top → bottom)

1. **Väder idag** (kompakt rad, högst upp)
2. **ACWR-coach + 7 dagars plan** (ersätter Daily Briefing + AI-coach-kortet)
3. **Jämförelse mot referens** (4 nyckeltal, ersätter Form/belastning + Pace-DNA)
4. **Senaste 10 pass** (oförändrad)
5. **Tempo- och distanskurvor** (oförändrade)

Tas bort från sidan: `DailyBriefingCard`, `TrainingLoadChart`, `PaceDNACard`, gamla "AI-coach"-kortet, samt nuvarande 5-statistikraden (snittempo/distans 4 v etc. – ersätts av jämförelsetalen).

---

### 1. Väderwidget (`WeatherStrip`)

- Försöker `navigator.geolocation.getCurrentPosition()` vid mount
- Faller tillbaka på sparad lat/lon i `localStorage` (sätts i Settings; default 57.71/11.97 Göteborg)
- Hämtar SMHI-prognos för innevarande dag via befintlig pattern i `briefing.server.ts`
- Visar som en horisontell rad med ikoner: ☀️/🌧️/❄️ + temp °C, vind m/s, nederbörd mm
- Server-fn: `getWeather({ lat, lon })` i `src/lib/weather.functions.ts`

### 2. ACWR-coach + rullande 7-dagars plan (`CoachPlanCard`)

Ersätter både `DailyBriefingCard` och nuvarande AI-coach-rutan.

**Coach-kommentar (överst i kortet):**
- Beräknar ACWR (Acute:Chronic Workload Ratio) = TSS senaste 7 d / snitt-TSS senaste 28 d
- Tolkning: <0.8 undertränad, 0.8–1.3 optimal, 1.3–1.5 hög risk, >1.5 skadezon
- AI får: ACWR, senaste 7 pass, mål, dagar kvar → skriver 2–3 meningar prestationsanalys + hur kommande pass anpassas
- Knapp "Uppdatera coach" + auto-trigga via Strava-webhook (utöka `strava-webhook.ts` att invalidera coach-cachen)
- Cachas i ny tabell `coach_plan` (en rad, jsonb)

**7 kommande pass (under kommentaren):**
- Visas som **rutor** (samma look som nuvarande StatCard-grid, 2 kol mobil / 4 kol desktop)
- Varje ruta: dag (Mån, Tis…), passtyp (ikon), distans, måltempo, kort syfte
- Knapp **"Visa fler 7 dagar"** → expanderar med dag 8–14 som **enkla rader** (kompakt lista, inte rutor)
- AI-prompten utökas: returnera 14 dagar i stället för 7, frontend visar 7 + collapsible 7

**Auto-uppdatering:** webhook → invalidera `coach_plan` → nästa render hämtar om. Manuell knapp finns alltid.

### 3. Jämförelsetal (`BenchmarkCard`)

Hårdkodade profilvärden – **fyll i dessa innan implementation:**
- Ålder: ?
- Kön: man (antaget)
- Vikt (kg): ?
- Längd (cm): ?

4 nyckeltal vs referens (män i din ålder, vikt, längd):

| Nyckeltal | Beräkning | Referens |
|---|---|---|
| **VDOT** | Jack Daniels formel från ditt bästa 5 km-tempo senaste 90 d | VDOT-tabell per åldersgrupp |
| **Cooper-test (12 min)** | Estimeras från ditt snabbaste 3–5 km-pass | Cooper-norm: utmärkt/bra/medel/svag |
| **VO2max-skattning** | Från snittpuls + tempo (Uth-Sørensen-formel) | ACSM-percentiler för åldersgrupp |
| **Vilopuls / HR-effektivitet** | Lägsta puls i lugna pass vs tempo | Norm för tränad löpare i åldersgruppen |

Visas som 2×2 grid med: nuvarande värde, percentil ("topp 25 %"), färgkodad indikator.

Tabeller läggs som konstanter i `src/lib/benchmarks.ts` (ingen DB, ingen AI).

### 4. + 5. Behålls oförändrat

Senaste 10 pass-tabellen och tempo/distans-kurvorna lämnas som de är.

---

## Tekniska detaljer

**Nya filer:**
- `src/lib/weather.functions.ts` + `weather.server.ts`
- `src/lib/coachplan.functions.ts` + `coachplan.server.ts` (ACWR + 14-dagarsplan)
- `src/lib/benchmarks.ts` (referenstabeller + beräkningar, ren TS)
- `src/components/WeatherStrip.tsx`
- `src/components/CoachPlanCard.tsx`
- `src/components/BenchmarkCard.tsx`

**DB-migration:**
- Ny tabell `coach_plan` (id=1, jsonb plan, jsonb commentary, computed_at). Ingen RLS (single-user app, samma mönster som `pace_dna`).
- Behåll `briefings`, `pace_dna`, `training_load` i schemat (inga drops) men sluta läsa från dem.

**Webhook-utökning:**
- `src/routes/api/public/strava-webhook.ts` raderar `coach_plan`-raden så nästa load regenererar.

**Borttaget från `src/routes/index.tsx`:**
- Imports + render av `DailyBriefingCard`, `TrainingLoadChart`, `PaceDNACard`
- Den befintliga `<section>` med 5 StatCards
- Det stora "AI-coach"-kortet med veckotabellen (ersätts av `CoachPlanCard`)

**Behålls:**
- Header, mål/countdown, login-flöde, senaste 10 pass-tabell, tempo- och distanskurvorna

---

## Innan jag bygger – behöver dina värden

Svara med: **ålder, vikt (kg), längd (cm)** så hårdkodar jag dem i `benchmarks.ts`. Sen kör jag hela ombyggnaden i nästa svar.
