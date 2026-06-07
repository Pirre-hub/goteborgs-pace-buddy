## Mål

Göra projektet redo att remixas till en ny person (t.ex. en kompis) utan att behöva leta igenom koden manuellt. Originalet fortsätter användas av dig, kopian körs separat med egen databas och egen Strava-koppling.

## Vad jag gör i koden

1. **Centralisera atletprofilen** i en ny fil `src/lib/athlete.ts`:
   ```ts
   export const ATHLETE = {
     firstName: "Per",
     nickname: "Pirre",
     age: 64,
   };
   ```
   En enda plats att ändra vid remix.

2. **Byt ut hårdkodade namn** mot `ATHLETE.firstName` / `ATHLETE.nickname` / `ATHLETE.age` i:
   - `src/lib/coachplan.server.ts` (system-prompt + user-prompt – "Per", "64-åring" osv.)
   - `src/lib/coachchat.functions.ts` (system-prompt)
   - eventuella UI-strängar som nämner "Per" (jag scannar och listar i implementationen)

3. **Lägg till `REMIX.md`** i projektroten med en kort checklista för nästa person:
   - Ändra `ATHLETE`-objektet i `src/lib/athlete.ts`
   - Race-mål sätts via Settings-sidan (ingen kod)
   - Byt Strava-secret `STRAVA_CLIENT_SECRET` + kör OAuth-flödet på nytt så `strava_tokens` fylls med den nya personens tokens
   - Töm gamla data-tabeller (`strava_activities`, `coach_plan`, `coach_conversations`, `training_load`, `daily_choices`, `briefings`, `pace_dna`, `race_goal`, `strava_tokens`, `strava_sync`) – färdig SQL inkluderad
   - `LOVABLE_API_KEY` och `ANTHROPIC_API_KEY` följer inte med remixen automatiskt – läggs till på nya projektet

## Vad du gör (manuellt, inte kod)

- **Remixa projektet** via projektmenyn → "Remix". Det skapar nytt Lovable-projekt med egen Cloud-databas (tom) och egna secrets-slots.
- **Strava-app**: antingen
   - (a) skapa en separat Strava-app för kompisen och lägg dess client secret som `STRAVA_CLIENT_SECRET`, eller
   - (b) återanvänd din Strava-app men låt kompisen göra OAuth-inloggning i nya appen – då hamnar hens tokens i den nya databasens `strava_tokens`.
- **API-nycklar**: `LOVABLE_API_KEY` och `ANTHROPIC_API_KEY` – sätts på nytt i nya projektet.

## Hur "uppdateras när originalet uppdateras" funkar

Remix är en engångskopia – det finns ingen automatisk synk. Två praktiska mönster:
- När du gör en förbättring här, säg till mig: "applicera senaste ändringen även i kompisens projekt" och jag gör motsvarande edit där.
- Eller: behåll båda i samma workspace så kan jag läsa cross-project och spegla ändringar på begäran.

Ingen kodändring behövs för det – bara värt att veta.

## Tekniska detaljer

- Inga DB-migrations krävs i originalet. Den nya databasen i remixen ärver schemat automatiskt.
- `race_goal`-tabellen är redan tom-vid-start-vänlig (Settings-sidan hanterar insert).
- Inga UI-komponenter behöver ändras struktur-mässigt; bara textsträngar som råkar nämna "Per".
