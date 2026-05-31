## Mål
Byt AI-motor i coachen från Lovable AI Gateway till Anthropic Claude API, både för träningsråd (`coach.server.ts`) och träningsplan (`coachplan.server.ts`).

## Steg

1. **Lägg till secret `ANTHROPIC_API_KEY`** via secrets-verktyget (du klistrar in nyckeln säkert i formuläret — inte i chatten).

2. **Uppdatera `src/lib/coach.server.ts`**
   - Byt endpoint från `https://ai.gateway.lovable.dev/v1/chat/completions` till `https://api.anthropic.com/v1/messages`.
   - Byt headers: `x-api-key: ANTHROPIC_API_KEY` + `anthropic-version: 2023-06-01` (ta bort `Authorization: Bearer`).
   - Byt request-format till Claude Messages API: `model`, `max_tokens`, `system` (sträng), `messages` (utan system-rollen).
   - Standardmodell: `claude-sonnet-4-5` (kan ändras).
   - Parsa svar från `data.content[0].text` istället för `choices[0].message.content`.

3. **Uppdatera `src/lib/coachplan.server.ts`** på samma sätt (samma endpoint, headers, payload-mappning och response-parsning). Tool-calling-anropet (för strukturerad output) konverteras till Claude `tools` + `tool_choice` så vi fortsatt får JSON-planen.

4. **Felhantering**: behåll 429/402-meddelanden men anpassa till Claude (401/429/529) så användaren får tydlig feedback.

5. **Verifiera** att inga andra filer pekar mot `ai.gateway.lovable.dev`.

## Frågor
- Vilken Claude-modell vill du använda? Förslag: `claude-sonnet-4-5` (bästa balansen). Alternativ: `claude-opus-4` (kraftfullast, dyrare) eller `claude-haiku-4-5` (snabb/billig).
- Ska `LOVABLE_API_KEY`-koden tas bort helt, eller behållas som fallback om Claude failar?
