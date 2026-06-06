## Problem

1. Modellen genererar inga gympass trots att system-prompten säger 4 pass/vecka (3 löp + 1 gym). Den prioriterar löppass och hoppar gympasset.
2. Planen är för ambitiös – för mycket km, för höga tempon, för många kvalitetspass för en 64-årig motionär.

## Ändringar i `src/lib/coachplan.server.ts`

### 1. Tvinga fram gympass i prompten

Lägg till en hård regel överst i `COACHREGLER`:

> **REGEL 0 (viktigast): Varje 7-dagarsperiod MÅSTE innehålla exakt 1 gympass. Över 14 dagar = exakt 2 gympass. Saknas gympasset är planen ogiltig. Gympasset placeras på en dag mellan två löppass (typ tor eller mån).**

Lägg också till explicit exempel-vecka i prompten så modellen ser strukturen konkret:

```
EXEMPEL normalvecka (kopiera mönstret):
Mån: Lugnt 6 km @ 6:30/km
Tis: Vila
Ons: Lugnt 6 km @ 6:30/km  (eller lätt fartlek om ACWR optimal)
Tor: Gym (styrka) 45 min – knän/höfter
Fre: Vila
Lör: Lugnt 8 km @ 6:30/km
Sön: Vila
```

### 2. Sänk ambitionsnivån

- Ta bort kravet på "2 kvalitetspass/vecka" – ersätt med "max 1 kvalitetspass/vecka, och bara om ACWR är 0.8–1.3".
- Sänk distanser: normalt löppass 6–8 km → **5–7 km**, långpass 14–18 km → **10–14 km**.
- Lugnt tempo 6:20–6:45/km → **6:30–7:00/km** (mer realistiskt för 64-åring i basperiod).
- Intervaller 5:00–5:20/km → **5:20–5:40/km**.
- Tröskel 5:40–5:55/km → **5:50–6:10/km**.

### 3. Förtydliga 4-dagars-veckan

Byt formuleringen "4 pass per vecka: 3 löppass + 1 gympass" till en explicit räkneregel:

> **Räkna alltid: 3 löppass + 1 gympass + 3 vilodagar = 7 dagar. Aldrig 4 löppass. Aldrig 0 gympass.**

### 4. Validering efter AI-svaret (defensiv)

Efter `parsed = toolUse.input` i `generatePlan()`, lägg till en sanity-check:

```ts
const gymCount = parsed.plan.filter(d => /gym|styrka|strength/i.test(d.type)).length;
if (gymCount < 2) {
  console.warn("[CoachPlan] AI skipped gym days, got", gymCount);
}
```

Loggas serverside – ingen retry, men synlig signal om modellen fuskar.

## Inga UI-ändringar

`CoachPlanCard.tsx` hanterar redan gym/vila/löp korrekt (purple border + 💪 för gym, grå + 🛏 för vila). När prompten faktiskt producerar gympass kommer de att visas automatiskt.

## Verifiering

Efter ändring: tryck "Uppdatera coach", öppna devtools-konsolen, kolla `[CoachPlan] full plan (...)`-loggen → ska visa minst 2 dagar med `type` som innehåller "Gym".
