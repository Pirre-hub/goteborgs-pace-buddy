# Remix-checklista – sätta upp appen för en annan person

Denna app är personlig coach för **Per "Pirren"** (64 år). Följ stegen nedan
för att skapa en egen version till någon annan.

## 1. Remixa projektet
I Lovable: projektmeny (▾ vid projektnamnet) → **Remix**. Det skapar ett nytt
Lovable-projekt med egen Cloud-databas (tom) och egna secrets.

## 2. Ändra atletprofilen
Öppna `src/lib/athlete.ts` och uppdatera värdena:

```ts
export const ATHLETE = {
  firstName: "Anna",
  firstNamePossessive: "Annas",
  nickname: "Annis",
  appName: "Annicoachen",
  age: 42,
  weightKg: 65,
  heightCm: 168,
  sex: "female" as const,
};
```

Alla coach-prompter (`coachplan.server.ts`, `coachchat.functions.ts`) hämtar
namn, ålder, vikt, längd och max-puls automatiskt härifrån via tokens
(`{{NAME}}`, `{{AGE}}`, osv).

**Notera:** Pulszonerna i prompterna (Zon 1–5 vid 117/132/141/149/156 bpm) är
beräknade för ålder 64. Om den nya personen har annan ålder, justera dessa
manuellt i båda filerna baserat på `maxHr(newAge)` – eller låt vara, då
zonerna är ungefärliga och AI-coachen anpassar ändå.

Uppdatera även app-titeln om du vill: sök efter `"Pirrecoachen"` i
`src/routes/index.tsx` och byt mot t.ex. `ATHLETE.appName`.

## 3. Sätt secrets i det nya projektet
Följande secrets följer **inte** med en remix – lägg till på nytt:

- `ANTHROPIC_API_KEY` – Claude-nyckel
- `LOVABLE_API_KEY` – auto-genereras när Lovable Cloud aktiveras
- `STRAVA_CLIENT_SECRET` – från Strava-appen (se steg 4)

## 4. Strava-koppling
Två alternativ:

**(a) Egen Strava-app för den nya personen** (rekommenderas)
1. Skapa app på https://www.strava.com/settings/api
2. Lägg dess client secret som `STRAVA_CLIENT_SECRET` i nya projektet
3. Uppdatera client_id där det är hårdkodat (sök i `src/lib/strava.server.ts`)
4. Sätt callback-URL till nya projektets publicerade domän

**(b) Återanvänd existerande Strava-app**
Behåll samma `STRAVA_CLIENT_SECRET`. Personen loggar in via OAuth-flödet i
nya appen och dennes tokens hamnar i den nya databasens `strava_tokens`.

## 5. Race-mål
Sätts via Settings-sidan i appen – ingen kod behöver röras.

## 6. Töm gammal data (om något följt med oväntat)
Kör i Lovable Cloud → SQL Editor:

```sql
TRUNCATE TABLE
  strava_activities, strava_tokens, strava_sync,
  coach_plan, coach_conversations, training_load,
  daily_choices, briefings, pace_dna, race_goal
RESTART IDENTITY;
```

## Hålla i synk med originalet
Remix är en engångskopia – det finns ingen automatisk synk. När originalet
uppdateras: be Lovable "applicera senaste ändringen även i kompisens
projekt" (fungerar bäst om båda projekten ligger i samma workspace).
