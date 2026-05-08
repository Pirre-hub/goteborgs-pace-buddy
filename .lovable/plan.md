## Mål
Gör loppet/målet redigerbart så du själv kan byta till nästa lopp när Göteborgsvarvet 2026 är avklarat – utan att be mig ändra i koden.

## Hur det fungerar

1. **Ny tabell `race_goal`** i databasen med ett aktivt mål åt gången:
   - Loppnamn (t.ex. "Göteborgsvarvet 2026", "Stockholm Marathon 2026")
   - Datum
   - Distans (km)
   - Måltempo (sek/km, lagras som tal – visas som 6:10/km)
   - Sluttid räknas ut automatiskt från distans × tempo

2. **Ny inställningssida `/settings`** nås via en kugghjulsikon i headern:
   - Formulär med fyra fält: namn, datum, distans, måltempo (mm:ss/km)
   - Knapp "Spara mål"
   - Visar nuvarande aktivt mål överst

3. **Dashboarden läser målet från databasen** istället för hårdkodade värden:
   - Countdown, rubrik ("Göteborgsvarvet 2026"), måltempo-linje i grafen, AI-promptens kontext – allt drivs av aktivt mål.
   - Om datumet passerats: countdown visar "Loppet är genomfört 🎉" + en knapp "Sätt nytt mål" som tar dig till `/settings`.

4. **AI-coachen** får automatiskt det nya målet (datum, distans, tempo) i sin prompt så råden anpassas direkt efter att du bytt mål. Den hårdkodade "lopp-taktik"-texten (Slottsskogen/Örgrytebacken) blir generell istället – eller så låter vi AI:n generera taktiken när du klickar på en knapp, anpassat efter det aktuella loppet.

## Tekniska detaljer
- **Migration:** Skapa `race_goal` (id, name, race_date, distance_km, goal_pace_sec, is_active, timestamps). Single-user → ingen `user_id`, ingen RLS-policy behövs men RLS aktiveras (deny-by-default) och vi läser/skriver via en server-funktion med admin-klienten. Seedar in nuvarande mål (Göteborgsvarvet, 2026-05-23, 21.1, 370 sek).
- **Nya filer:**
  - `src/lib/goal.functions.ts` – `getActiveGoal`, `updateGoal`
  - `src/lib/goal.server.ts` – DB-anrop
  - `src/routes/settings.tsx` – formulär
- **Uppdatera:** `src/routes/index.tsx` (läs goal via React Query, ersätt hårdkodade konstanter), `src/lib/coach.functions.ts` + `coach.server.ts` (ta emot goal som input), `src/routes/__root.tsx` om vi lägger länk där.
- **Lopp-taktik-kortet** byts till generella tips ("Spring jämnt, spara backarna, drick vid varje kontroll") så det fungerar för vilket långlopp som helst.

## Inte med
- Historik över avklarade lopp (du sa att resultat inte behöver sparas)
- Flera samtidiga mål
- Loppspecifik bantaktik (Slottsskogen etc. försvinner)

Säg till om något ska justeras, annars trycker du "Implement plan".
