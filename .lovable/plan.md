## Status

Filen `src/lib/coachplan.server.ts` använder redan Anthropic API (`api.anthropic.com/v1/messages`), `claude-sonnet-4-5`, `x-api-key`-headers, tool calling med `rolling_plan`, och `last7Lines` inkluderar redan tempo + puls. CHANGE 1 och CHANGE 3 är alltså redan på plats.

Det som faktiskt skiljer är **system-prompten** (CHANGE 2) – nuvarande version är den försiktiga "varm peppande" coachen, du vill ha den ambitiösa "direkt, ställer krav"-versionen med 80/20-regeln och tvingande kvalitetspass.

## Ändringar

**1. Byt `system`-konstanten** (rad ~228 i `generatePlan`) till den nya ambitiösa coach-prompten med:
- Direkt/ärlig ton istället för "varm peppande"
- 80/20-regeln explicit
- Krav på 2 kvalitetspass/vecka när ACWR är 0.8–1.3
- Specifika tempon för varje passtyp (intervaller 5:00–5:20/km, tröskel 5:40–5:55/km, lugnt 6:20–6:50/km)
- ACWR <0.8 → öka volym istället för "öka försiktigt"

**2. Uppdatera `commentary`-beskrivningen i `TOOL`** så den matchar nya tonen:
- Från: "2-4 meningar … varm peppande ton"
- Till: "3-5 meningar … Direkt, ärlig, peppande ton – inte defensiv"

**3. Uppdatera `max_tokens`** från 8192 → 2000 (enligt din spec). Notera: detta är en sänkning som kan trunkera långa planer – bekräfta att du vill ha 2000 (8192 ger marginal för 14-dagarsplanen + commentary).

**4. Höj `max_tokens` i `user`-promptens instruktion** så commentary blir 3–5 meningar (nuvarande säger "3–5", redan korrekt).

Inga andra filer påverkas. Ingen ny secret behövs (`ANTHROPIC_API_KEY` används redan).

## Frågor innan implementation

1. **`max_tokens`: 2000 eller behålla 8192?** 14 dagar × ~50 tokens/dag + commentary + tool overhead ligger nära 2000. Risk för trunkering.
2. **Behålla `TOOL`-konstanten** (din nya `TOOL_ANTHROPIC` har samma struktur + `additionalProperties: false`) eller ersätta? Föreslår: ersätta `TOOL` med innehållet från `TOOL_ANTHROPIC` (en konstant, inte två).
