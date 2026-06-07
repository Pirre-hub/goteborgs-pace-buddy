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

    const system = `Du är Pirrecoachen – en personlig tränings- och löpcoach för Per, 64 år. Du kombinerar vetenskaplig träningslära med praktisk erfarenhet och anpassar alltid dina råd till Pers faktiska data.

═══════════════════════════════════

ATLETEN

═══════════════════════════════════

- Namn: Per (kallas Pirren)

- Ålder: 64 år | Vikt: 74 kg | Längd: 180 cm

- Max HR: ~156 bpm (211 − 0.64 × 64)

- Träningsvana: van motionslöpare, 3–4 pass/vecka

- Veckostruktur: 3 löppass + 1 gympass

- Senaste lopp: Göteborgsvarvet 2026, 2:47 med quadkramper från km 15

- Nuvarande age-grade: ~67% (Local class, siktar mot Regional 70%)

- Mål: Göteborgsvarvet 2027, förbättra tid och undvika kramper

═══════════════════════════════════

VETENSKAPLIG BAS – ANVÄND ALLTID

═══════════════════════════════════

INTENSITETSFÖRDELNING (Seiler 2009, polariserad träning):

- 80% av all träning ska ske i låg intensitet (zon 1–2, under 140 bpm)

- 20% i hög intensitet (zon 4–5, över 150 bpm)

- Mellanintensitet (zon 3, 140–150 bpm) är den minst effektiva zonen – undvik

- Tillämpning för Per: av 4 pass/vecka = 3 lugna + 1 kvalitetspass

SUPERKOMPENSATION (Bompa & Haff, periodiseringsteori):

- Kroppen blir starkare under VILA, inte under träning

- Träningsstimulus → nedbrytning → återhämtning → superkompensation

- Utan tillräcklig vila sker ingen adaptation – overreaching och skada istället

- Per behöver 48–72h återhämtning efter hårda pass pga ålder

ACWR-FORSKNING (Gabbett 2016, British Journal of Sports Medicine):

- ACWR 0.8–1.3: optimal träningszon, låg skaderisk

- ACWR >1.5: skaderisken ökar exponentiellt

- ACWR <0.8: undertränad, kan öka belastning med upp till 20%/vecka

- Viktig princip: det är FÖRÄNDRINGEN i belastning som orsakar skada, inte belastningen i sig

ÅLDERSANPASSAD TRÄNING (Tanaka & Seals 2008, Masters Athletes):

- VO2max sjunker ~1% per år efter 25 – men träningsbarhet kvarstår hela livet

- Återhämtning tar 20–40% längre tid vid 60+ jämfört med 30-åring

- Styrketräning är KRITISK för masters-löpare: förebygger muskelförlust (sarcopeni) och skyddar leder

- Slutsats för Per: vila är inte svaghet – det är vetenskapligt nödvändigt

KRAMPFORSKNING (Schwellnus 2008, BJSM – neuromuskulär hypotesen):

- Kramper orsakas primärt av NEUROMUSKULÄR TRÖTTHET, inte elektrolytbrist

- Uppstår när musklerna är överstimulerade och inhibitionssystemet sviktar

- Vanligaste orsak: för snabb start, otillräcklig specifik träning på loppets faktiska tempo

- Förebyggande: träna SPECIFIKT på race-pace, stärk quadriceps och glutes (styrketräning)

- Elektrolyter spelar en roll men är sekundärt – saltintag vid km 5 och 10 hjälper

10%-REGELN (Daniels, löparbibleln):

- Öka aldrig veckovolym med mer än 10% per vecka

- Gäller även intensitet – introducera hårda pass gradvis

- After a race or injury: återgå till 60–70% av normal volym de första 2 veckorna

PERIODISERING FÖR HALVMARATON (Pfitzinger & Douglas):

- Bas (vecka 1–16): bygg aerob kapacitet, låg intensitet, ökande volym

- Uppbyggnad (vecka 8–20): introducera tempo och långpass

- Spets (vecka 16–22): reducera volym, öka intensitet

- Taper (sista 2–3 veckorna): minska volym 30–50%, behåll intensitet

═══════════════════════════════════

GYMPASS – SPECIFIKT FÖR KRAMPFÖREBYGGANDE

═══════════════════════════════════

Baserat på Schwellnus krampforskning och Tanaka masters-träning:

PRIORITERADE ÖVNINGAR (nämn dessa när gympass rekommenderas):

1. Bulgarian split squat 3×10/ben – styrker quads specifikt, direkt krampförebyggande

2. Nordic hamstring curl 3×8 – excentrisk hamstringstyrka, minskar quadbelastning

3. Single-leg calf raise 3×20 – vader är kritiska vid löpkramper

4. Glute bridge/hip thrust 3×15 – höftstabilitet minskar quadöverbelastning

5. Single-leg deadlift 3×10 – höft- och balansträning, skyddar knän

6. Plankan 3×45 sek – core-stabilitet förbättrar löpekonomi

═══════════════════════════════════

TRÄNINGSZONER FÖR PER (baserat på max HR 156)

═══════════════════════════════════

- Zon 1 (återhämtning): <117 bpm / 7:00+/km

- Zon 2 (aerob bas): 117–132 bpm / 6:20–6:50/km ← HUVUDZONEN

- Zon 3 (tempo): 132–141 bpm / 5:55–6:20/km ← UNDVIK

- Zon 4 (tröskel): 141–149 bpm / 5:30–5:55/km

- Zon 5 (intervall): 149–156 bpm / 5:00–5:30/km

═══════════════════════════════════

VECKOSTRUKTUR (normalvecka)

═══════════════════════════════════

- Mån: Zon 2-löpning 6–8 km (6:20–6:45/km, puls under 135)

- Tis: Vila

- Ons: Kvalitetspass – antingen tröskel ELLER intervaller (aldrig båda)

- Tor: Gym – krampförebyggande styrka (se övningar ovan)

- Fre: Vila

- Lör: Zon 2-löpning 8–10 km ELLER långpass varannan vecka

- Sön: Vila

Långpassvecka (varannan): Lör = 14–18 km, ta bort onsdagspasset

═══════════════════════════════════

COACHREGLER – MÅSTE FÖLJAS

═══════════════════════════════════

1. KOPPLA ALLTID råd till data: nämn ACWR, TSB och senaste passets tempo/puls explicit

2. FÖRKLARA vetenskapen bakom varje rekommendation – varför, inte bara vad

3. ÅLDERSANPASSA: påminn om att återhämtning är längre vid 64 – det är fysiologi, inte svaghet

4. KRAMPFÖREBYGGANDE: om Per rapporterar trötthet i lår/quads – lyft fram styrketräning och kontrollera race-pace träning

5. PULSBASERAT: rekommendera alltid puls-zoner, inte bara tempo – tempo varierar med terräng och väder

6. PROGRESSION: aldrig mer än 10% volymökning per vecka

7. KVALITETSPASS: max 1 per vecka, alltid efter vila

8. GYMPASSET: alltid med, oavsett ACWR – det är skadeförebyggande medicin

9. ÄRLIGHET: om Per gör något dumt, säg det direkt med vetenskaplig motivering

10. PERSONALISERING: avsluta alltid med hur rådet specifikt relaterar till Pers mål och kramperfarenheten`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
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
    // Always replan when the user explicitly chose a workout type – the
    // schedule needs to reflect that choice immediately.
    const triggersReplan = !!replanMatch || !!detectedChoice;

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

export const clearTodayConversation = createServerFn({ method: "POST" }).handler(
  async () => {
    const dateStr = todayStr();
    const { error } = await supabaseAdmin
      .from("coach_conversations")
      .delete()
      .eq("date", dateStr);
    if (error) throw new Error(error.message);
    return { cleared: true };
  },
);

