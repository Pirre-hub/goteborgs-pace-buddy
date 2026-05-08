## Mål
Lägg till AI-genererade träningsrekommendationer på dashboarden: nästa pass + en 7-dagars plan, anpassat mot 6:10/km på Göteborgsvarvet 23 maj 2026.

## Hur det fungerar

1. **Ny knapp "Hämta träningsråd"** överst på dashboarden (under countdown). När du klickar:
   - Vi skickar dina senaste 30 löppass + målet (6:10/km, 21,1 km, racedatum) till en server-funktion.
   - Server-funktionen anropar Lovable AI (Gemini 3 Flash) med en svensk löpcoach-prompt.
   - AI:n returnerar strukturerad JSON via tool calling – ingen fri text att parsa.

2. **Resultatet visas i två kort:**
   - **Nästa pass** – typ (lugnt distanspass / intervall / tröskel / långpass / vila), distans, måltempo, syfte (1–2 meningar), och varför just detta nu baserat på din senaste belastning.
   - **Veckoplan (7 dagar)** – tabell med dag, passtyp, distans/tid, tempo, kort kommentar.

3. **Cache:** Råden cachas 6 h i React Query så du inte bränner AI-kvot vid varje sidladdning. Knapp för "Generera nytt råd" finns alltid.

## Underlag som skickas till AI:n
- Senaste 30 pass: datum, distans, tid, tempo, snittpuls
- Härledd statistik: veckovolym senaste 4 v, längsta pass, snittempo, dagar sedan senaste pass
- Målkontext: 6:10/km, 21,1 km, dagar kvar till 23 maj 2026

AI:n får uttryckliga regler: progressiv överbelastning max 10 %/v, minst 1 vilodag, långpass max ett per vecka, anpassa intensitet om senaste pass var hårt.

## Tekniska detaljer

- **Ny fil:** `src/lib/coach.functions.ts` – server function `getTrainingAdvice` som tar runs-arrayen, anropar Lovable AI Gateway via `fetch`, använder tool calling med JSON-schema (`next_session` + `week_plan[]`), returnerar typad data.
- **Ny fil:** `src/lib/coach.server.ts` – håller AI-prompt och anrop, läser `LOVABLE_API_KEY` från `process.env` inuti handler.
- **Uppdatera:** `src/routes/index.tsx` – lägg till två nya `Card`-sektioner + knapp + `useMutation` som triggar `getTrainingAdvice`.
- **Felhantering:** Visa toast om 429 (rate limit) eller 402 (slut på krediter).
- **Inga DB-ändringar** behövs – rekommendationerna sparas inte (bara cache i klienten). Kan läggas till senare om du vill spara historik.

## Inte med i denna iteration
- Sparad historik över råd
- Push-notiser / mejl
- Anpassning baserat på vädret eller kalender
- Pulszoner (kan läggas till om du vill)

Säg till om något ska ändras, annars trycker du "Implement plan" så bygger jag.
