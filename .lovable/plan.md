
# Sprint: Kortare coach + Prognos överst

Två väl avgränsade förändringar som tillsammans förändrar hur appen känns:
beslut före resonemang, och "är jag på rätt väg?" på 1 sekund.

---

## Steg 1 – Kortare, beslutsorienterade coachsvar

**Mål:** Max 3–5 meningar per svar. Ett beslut. En rekommendation.
Inga studiereferenser eller fysiologi-utläggningar om användaren inte frågar.

**Vad ändras:**
- `src/lib/coach.server.ts` – skärp `system`-prompten:
  - "Svara på svenska, max 3–5 meningar."
  - "Ge ett tydligt beslut + en konkret rekommendation."
  - "Nämn aldrig studier, författare eller fysiologiska mekanismer
    om användaren inte explicit frågar 'varför'."
- `src/lib/briefing.server.ts` – samma stilregler för dagens briefing.
- `src/lib/coachplan.server.ts` (om `commentary` genereras där) –
  korta `commentary` till max 2 meningar.
- ACWR→beslut-översättning: lägg en hjälpfunktion (ren TS, ingen AI)
  som mappar ACWR-värdet till en mening:
  - `< 0.8` → "Du kan öka volymen 10–15 % utan ökad skaderisk."
  - `0.8–1.3` → "Bra balans – håll nuvarande volym."
  - `> 1.3` → "Sänk volymen 10–20 % den här veckan."
  Visas i `TrainingLoadCard` / `CoachPlanCard` bredvid siffran.
- Behåll möjlighet att se längre resonemang: lägg en
  `<details>Visa resonemang</details>`-toggle i `CoachChatCard` /
  briefing-kortet så det fördjupade svaret finns kvar men är dolt.

**Påverkade filer:**
- `src/lib/coach.server.ts` (prompt)
- `src/lib/briefing.server.ts` (prompt)
- `src/lib/coachplan.server.ts` (prompt, ev.)
- `src/lib/training.ts` *(ny liten helper för ACWR→text)*
- `src/components/CoachChatCard.tsx` (collapsible)
- `src/components/DailyBriefingCard.tsx` (collapsible)
- `src/components/TrainingLoadCard.tsx` / `CoachPlanCard.tsx`
  (visa ACWR-beslutstext)

---

## Steg 2 – Prognos vs mål överst på startsidan

**Mål:** Översta kortet på `/` svarar på frågan
"Är jag närmare eller längre från mitt mål än förra veckan?"

**Layout (nytt `RacePrognosisCard` överst i `src/routes/index.tsx`):**

```text
┌─────────────────────────────────────────┐
│ Stockholm Halvmaraton · 80 dagar kvar   │
│                                          │
│  Mål         Prognos        Gap          │
│  2:10:00     2:17:09       +7:09         │
│                                          │
│  🟡 På väg – 3 sek/km från måltempo      │
│  Trend senaste 4 v: -0:08/km ↗           │
└─────────────────────────────────────────┘
```

**Prognoslogik (ren beräkning, ingen AI):**
Ny server-funktion `getRacePrognosis` i `src/lib/prognosis.functions.ts`
+ `prognosis.server.ts`:

1. Hämta `race_goal` (distans, måltempo, datum).
2. Hämta senaste 28 dagars löpningar från `strava_activities`.
3. Beräkna **aktuell uthållighetspace**:
   - Filtrera pass ≥ 60 % av loppdistansen (för halvmara: ≥ 12 km).
   - Om inga sådana finns: använd median-pace för alla pass
     ≥ 8 km, justerad med en distansfaktor (Riegel-formeln,
     exponent 1.06).
4. **Riegel-projektion** till loppdistansen:
   `T_race = T_ref * (D_race / D_ref)^1.06`
5. **CTL-justering:** om CTL ökat senaste 4 v → minska prognostid
   proportionellt (max 2 %); om minskat → öka (max 2 %).
6. **Trend:** jämför nuvarande projicerad tid mot samma beräkning
   gjord för 4 veckor sedan (med passen som fanns då).
7. Returnera: `{ goalTime, prognosisTime, gapSeconds,
   trendSecPerKm4w, status: 'on_track' | 'behind' | 'ahead',
   basedOnRuns: number }`.

**Status-tröskel:**
- `ahead` om prognos ≤ mål
- `on_track` om gap ≤ 5 sek/km från måltempo
- `behind` annars

**Trafikljus:** 🟢 ahead · 🟡 on_track · 🔴 behind.

**Edge cases:**
- Inget aktivt mål → kortet visas inte.
- Färre än 3 relevanta pass → visa "Behöver fler pass för prognos
  (X/3)" istället för siffra.

**Påverkade filer:**
- `src/lib/prognosis.server.ts` *(ny)*
- `src/lib/prognosis.functions.ts` *(ny)*
- `src/components/RacePrognosisCard.tsx` *(ny)*
- `src/routes/index.tsx` (montera kortet överst)

---

## Tekniska detaljer

- Inga DB-migrationer behövs – all data finns redan
  (`race_goal`, `strava_activities`, `training_load`).
- Inga nya secrets.
- Prognosberäkningen är deterministisk (ingen AI-kostnad).
- Coach-promptändringar minskar token-användning → billigare.
- Server-fns följer befintligt mönster (`createServerFn` +
  `supabaseAdmin` via `await import` i `.functions.ts`).

## Ordning
1. Steg 2 först (Prognoskortet) – störst visuell effekt, ingen
   risk att förändra befintlig AI-output.
2. Steg 1 sedan (prompt-skärpning + ACWR-text + collapsible) –
   iterativt, lätt att finjustera när vi ser hur korta svar känns.

## Inte med i denna sprint
- Formtrend med zon-data (kräver Strava streams-hämtning).
- Adaptiv plan (`weekly_plans`/`daily_adjustments`-logik).
- Söndagsrapport.
- Personalisering på split-nivå.

Säg till så kör vi.
