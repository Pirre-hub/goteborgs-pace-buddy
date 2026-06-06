import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generatePlan } from "./coachplan.server";

type Message = { role: "user" | "coach"; content: string };

type PlanContext = {
  todayPlan: string;
  acwr: number | null;
  tsb: number | null;
  lastRun: string;
  daysToRace: number;
  recentDeviations: string;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export const getTodayConversation = createServerFn({ method: "GET" }).handler(
  async () => {
    const dateStr = todayStr();
    const { data } = await supabaseAdmin
      .from("coach_conversations")
      .select("role, content, created_at")
      .eq("date", dateStr)
      .order("created_at", { ascending: true });
    return {
      messages: ((data ?? []) as { role: string; content: string }[]).map(
        (m) => ({ role: m.role as "user" | "coach", content: m.content }),
      ) as Message[],
      date: dateStr,
    };
  },
);

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { message: string; planContext: PlanContext }) => data,
  )
  .handler(async ({ data }) => {
    const { message, planContext } = data;
    const dateStr = todayStr();

    // Detect explicit choice from message and persist to daily_choices
    const lower = message.toLowerCase();
    let detectedChoice: "running" | "strength" | "walking" | "rest" | null = null;
    if (/\b(löpning|löper|löpa|spring|springer|jogg)/.test(lower)) detectedChoice = "running";
    else if (/\b(styrka|gym|styrkepass)/.test(lower)) detectedChoice = "strength";
    else if (/\b(promenad|promenera|går\s|walk)/.test(lower)) detectedChoice = "walking";
    else if (/\b(vila|vilar|vilodag|rest)/.test(lower)) detectedChoice = "rest";

    if (detectedChoice) {
      await supabaseAdmin
        .from("daily_choices")
        .upsert(
          {
            date: dateStr,
            recommended_type: planContext.todayPlan.slice(0, 64) || "unknown",
            actual_choice: detectedChoice,
            note: message,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "date" },
        );
    }

    await supabaseAdmin.from("coach_conversations").insert({
      date: dateStr,
      role: "user",
      content: message,
    });


    const { data: history } = await supabaseAdmin
      .from("coach_conversations")
      .select("role, content")
      .eq("date", dateStr)
      .order("created_at", { ascending: true });

    const messages = ((history ?? []) as { role: string; content: string }[]).map(
      (m) => ({
        role: (m.role === "coach" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: m.content,
      }),
    );

    const tsbLabel =
      planContext.tsb != null
        ? planContext.tsb > 5
          ? "✓ Pigg"
          : planContext.tsb > -10
          ? "~ Balanserad"
          : "⚠ Trött"
        : "";

    const system = `Du är Pirrecoachen – en personlig träningscoach för Per, 64 år. Du för en daglig konversation om träning.

ATLETENS KONTEXT IDAG:
- Rekommenderat pass: ${planContext.todayPlan}
- ACWR: ${planContext.acwr ?? "okänd"}
- TSB (form): ${planContext.tsb ?? "okänd"} ${tsbLabel}
- Senaste pass: ${planContext.lastRun}
- Dagar till nästa lopp: ${planContext.daysToRace}
${planContext.recentDeviations ? `- Avvikelser senaste 7 dagarna: ${planContext.recentDeviations}` : ""}

DITT UPPDRAG:
1. Lyssna på vad Per vill göra och hur han känner sig
2. Ge en kort, konkret respons (2-4 meningar) – direkt och personlig
3. Om Per väljer något som fungerar bra: bekräfta och ge specifika tips för passet
4. Om Per väljer något som är suboptimalt: påpeka det ärligt men respektfullt, förklara varför
5. Om Per väljer vila: acceptera men fråga om det är trötthet, tidsbrist eller något annat
6. Om Per avvikit från planen 3+ dagar i rad: ta upp det direkt, fråga vad som händer
7. Avsluta ALLTID med att fråga om du ska justera hela veckoschemat baserat på valet

SVARSSTIL:
- Kort och direkt – max 4 meningar
- Varm men ärlig – du är en tränare, inte en ja-sägare
- Svenska
- Inkludera alltid ett konkret tips för passet Per väljer

JUSTERA PLAN:
Om Per väljer något som avviker från rekommendationen OCH det påverkar veckan,
avsluta ditt svar med exakt denna JSON-markör på en ny rad:
REPLAN:{"reason": "kort förklaring", "change": "vad som ändras i planen"}

Annars inkludera INTE denna markör.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system,
        messages,
      }),
    });

    const json = (await res.json()) as {
      content?: { text?: string }[];
    };
    const responseText = json.content?.[0]?.text ?? "Kunde inte generera svar.";

    const replanMatch = responseText.match(/REPLAN:(\{[\s\S]*\})/);
    const cleanResponse = responseText.replace(/\s*REPLAN:\{[\s\S]*\}\s*$/, "").trim();
    const triggersReplan = !!replanMatch;

    await supabaseAdmin.from("coach_conversations").insert({
      date: dateStr,
      role: "coach",
      content: cleanResponse,
      triggers_replan: triggersReplan,
    });

    if (triggersReplan) {
      try {
        await generatePlan();
      } catch (e) {
        console.error("replan failed", e);
      }
    }

    return { response: cleanResponse, triggersReplan };
  });
