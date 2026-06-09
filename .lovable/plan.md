
Tre konkreta fixar mot de problem du tar upp.

---

## 1. Prognos baserad på fler pass (inte bara långpass)

**Problem idag:** `prognosis.server.ts` filtrerar löppass `≥ 60 %` av loppdistansen (≥ 12,6 km för halvmara), fallback ≥ 8 km. Har du bara 1 långpass blir prognosen i praktiken bara det passet × Riegel.

**Fix i `src/lib/prognosis.server.ts`:**
- Sänk minsta passlängd till **≥ 5 km** (Riegel är rimligt accurate ner till ~5 km för halvmara).
- Använd **alla** löppass i fönstret, inte bara ett urval. Räkna ut prognos per pass och **viktning per distans** (längre pass väger mer) i stället för enkel median.
- Bredda fönstret till **42 dagar** (i dag 28) så fler pass kommer med.
- Lägg till tempo-tier-justering: snittpace för pass ≥ 10 km ger en separat projektion som väger ~60 %, alla andra pass tillsammans ~40 %. På så sätt syns intervaller/tempo också, inte bara distanspass.
- Visa i `RacePrognosisCard` hur många pass prognosen bygger på + spridning (t.ex. "12 pass, intervall 2:14–2:21").

**Inga DB-ändringar.**

---

## 2. Planen ska inte ändras utan ny data

**Problem idag:** Varje kall till `/coachplan` triggar potentiellt `generatePlan()`, och `sendMessage` i `coachchat.functions.ts` kallar `generatePlan()` på varje upptäckt val (löp/styrka/promenad/vila), även om du bara skriver "ok jag tar löpning" två gånger. AI:n returnerar olika planer varje gång → upplevs som att den "ändrar utan anledning".

**Fix:**
- I `coachplan.server.ts`, lägg en `shouldRegeneratePlan()` som returnerar `false` om:
  - Cachad plan finns, **OCH**
  - Ingen ny Strava-aktivitet sedan `coach_plan.computed_at`, **OCH**
  - Inget nytt `daily_choices.actual_choice` för i dag sedan dess, **OCH**
  - Cachen är < 6 h gammal.
  Annars `true`.
- `refreshCoachPlan` server-fn: respektera `shouldRegeneratePlan()` om inte body innehåller `{ force: true }`. Lägg en "Uppdatera plan"-knapp i `CoachPlanCard` som skickar `force: true` (explicit användarintent).
- I `sendMessage` (`coachchat.functions.ts`): kalla bara `generatePlan()` om `detectedChoice` är **annorlunda** än det redan sparade `daily_choices.actual_choice` för i dag. Idag triggas replan även när användaren upprepar samma val.
- Skydda mot prompt-drift: lägg `temperature: 0` i Claude-anropet i `generatePlan()` så samma indata ger samma plan.

**Inga DB-ändringar.**

---

## 3. Coachen ska komma ihåg flera dagar + sluta gnälla om avvikelser

**Problem idag:** `getTodayConversation` + `sendMessage` skickar bara dagens meddelanden till modellen. Allt från i går är borta. Och `coachplan` matar in "AVVIKELSER SENASTE 14 DAGAR" + "VARNING ... avvikit 3 dagar i rad" som coachen sedan rapar upp som klagomål.

**Fix i `coachchat.functions.ts`:**
- Hämta konversationshistorik **7 dagar bakåt**, inte bara `eq("date", dateStr)`. Skicka som `messages`-array med datum-prefix på äldre meddelanden ("[i går 18:32] …") så modellen vet vad som sas när.
- Lägg en kort "MINNE"-sektion i `liveContext` med 3–5 punkter sammanfattat från de senaste dagarnas konversation (kan tas direkt från senaste 14 meddelanden utan AI-sammanfattning – ren strängklippning räcker som start).
- Lägg till explicit regel i `system`-prompten:
  > "Du minns vad ni pratade om de senaste 7 dagarna. Referera till tidigare beslut när det är relevant. Upprepa aldrig samma fråga eller varning som redan besvarats."

**Fix i `coachplan.server.ts` (planens commentary):**
- Ta bort den nuvarande "AVVIKELSER"-listan och `consecutiveDeviations >= 3`-varningen ur prompten. Avvikelser från en AI-genererad plan är **inte** en avvikelse – det är ett val. Behåll i stället en neutral rad: "Pers senaste val: löpning/styrka/vila" utan värdeladdning.
- Lägg regel i `system`:
  > "Behandla {{NAME}}s val som data, inte som olydnad. Kommentera inte att planen 'inte följdes'. Anpassa nästa pass utifrån vad som faktiskt gjordes."

---

## Ordning
1. **#3 (minne + sluta gnälla)** – minst risk, störst upplevd skillnad direkt.
2. **#2 (stabilare plan)** – tar bort onödiga AI-anrop och slumpvis omplanering.
3. **#1 (bredare prognos)** – behöver lite mer omsorg kring viktning/visualisering.

## Filer som ändras
- `src/lib/coachchat.functions.ts` (historik 7 d, minne, ta bort spurious replan)
- `src/lib/coachplan.server.ts` (`shouldRegeneratePlan`, temperature 0, ta bort avvikelse-skäll)
- `src/lib/coachplan.functions.ts` (force-flagga på `refreshCoachPlan`)
- `src/lib/prognosis.server.ts` (≥5 km, viktad projektion, 42 d, tier-blend)
- `src/components/CoachPlanCard.tsx` ("Uppdatera plan"-knapp)
- `src/components/RacePrognosisCard.tsx` (visa antal pass + spridning)

## Inte med
- Egentlig AI-sammanfattning av historik (för dyrt nu – ren strängklippning räcker).
- Adaptiva veckoplaner från `weekly_plans`/`daily_adjustments`.
- Zon-data per pass.

Säg till så kör vi.
