import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generatePlan } from "./coachplan.server";
import { personalizePrompt } from "./athlete";

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
    // Hämta 7 dagar bakåt så coachen har minne av tidigare beslut.
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = `${since.getFullYear()}-${(since.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${since.getDate().toString().padStart(2, "0")}`;
    const { data } = await supabaseAdmin
      .from("coach_conversations")
      .select("role, content, created_at, date")
      .gte("date", sinceStr)
      .order("created_at", { ascending: true });
    return {
      messages: ((data ?? []) as { role: string; content: string; date: string }[]).map(
        (m) => ({
          role: m.role as "user" | "coach",
          content: m.content,
          date: m.date,
        }),
      ),
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

    // Bara persistera om valet faktiskt ändrats (slipper trigga replan i onödan).
    let choiceChanged = false;
    if (detectedChoice) {
      const { data: existing } = await supabaseAdmin
        .from("daily_choices")
        .select("actual_choice")
        .eq("date", dateStr)
        .maybeSingle();
      choiceChanged = existing?.actual_choice !== detectedChoice;
      if (choiceChanged) {
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
    }

    await supabaseAdmin.from("coach_conversations").insert({
      date: dateStr,
      role: "user",
      content: message,
    });

    // Hämta 7 dagars historik så coachen minns tidigare beslut.
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = `${since.getFullYear()}-${(since.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${since.getDate().toString().padStart(2, "0")}`;
    const { data: history } = await supabaseAdmin
      .from("coach_conversations")
      .select("role, content, date, created_at")
      .gte("date", sinceStr)
      .order("created_at", { ascending: true });

    const weekdayShort = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
    const messages = ((history ?? []) as {
      role: string;
      content: string;
      date: string;
      created_at: string;
    }[]).map((m) => {
      const isToday = m.date === dateStr;
      const d = new Date(m.created_at);
      const prefix = isToday
        ? ""
        : `[${weekdayShort[d.getDay()]} ${m.date.slice(5)}] `;
      return {
        role: (m.role === "coach" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: prefix + m.content,
      };
    });

    const tsbLabel =
      planContext.tsb != null
        ? planContext.tsb > 5
          ? "✓ Pigg"
          : planContext.tsb > -10
          ? "~ Balanserad"
          : "⚠ Trött"
        : "";

    // Fetch detailed activities for last 28 days + aggregate stats for full history
    const now = new Date();
    const twentyEightDaysAgo = new Date(now);
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

    const { data: recentActs } = await supabaseAdmin
      .from("strava_activities")
      .select("name, distance, moving_time, average_heartrate, sport_type, start_date_local")
      .gte("start_date_local", twentyEightDaysAgo.toISOString())
      .order("start_date_local", { ascending: false })
      .limit(60);

    // Aggregate stats for full Strava history (all activities)
    const { data: allActs } = await supabaseAdmin
      .from("strava_activities")
      .select("distance, moving_time, sport_type, start_date_local, average_heartrate")
      .order("start_date_local", { ascending: false });

    const weekdayNamesSv = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
    const todayLabel = `${weekdayNamesSv[now.getDay()]} ${now.toLocaleDateString("sv-SE")}`;

    const fmtPace = (distM: number, secs: number) => {
      if (!distM) return "–";
      const sec = secs / (distM / 1000);
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return `${m}:${s.toString().padStart(2, "0")}/km`;
    };

    const recentActsStr = (recentActs ?? []).length
      ? (recentActs ?? [])
          .map((a) => {
            const d = new Date(a.start_date_local as string);
            const day = weekdayNamesSv[d.getDay()];
            const dateShort = d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
            const km = ((a.distance as number) / 1000).toFixed(1);
            const min = Math.round((a.moving_time as number) / 60);
            const pace = fmtPace(a.distance as number, a.moving_time as number);
            const hr = a.average_heartrate ? ` ${Math.round(a.average_heartrate as number)}bpm` : "";
            return `- ${day} ${dateShort}: ${a.sport_type} ${km}km, ${min}min, ${pace}${hr} (${a.name})`;
          })
          .join("\n")
      : "- Inga loggade pass senaste 28 dagarna";

    // Bucket aggregates: 90 dagar, 365 dagar, total
    const buckets = [
      { label: "Senaste 90 dagarna", days: 90 },
      { label: "Senaste 365 dagarna", days: 365 },
      { label: "Hela historiken", days: Number.POSITIVE_INFINITY },
    ];
    const summarize = (cutoffDays: number) => {
      const cutoff = cutoffDays === Number.POSITIVE_INFINITY
        ? new Date(0)
        : new Date(now.getTime() - cutoffDays * 86400000);
      const subset = (allActs ?? []).filter(
        (a) => new Date(a.start_date_local as string) >= cutoff,
      );
      const runs = subset.filter((a) => /run/i.test(a.sport_type as string));
      const totalKm = subset.reduce((s, a) => s + Number(a.distance ?? 0) / 1000, 0);
      const runKm = runs.reduce((s, a) => s + Number(a.distance ?? 0) / 1000, 0);
      const runSec = runs.reduce((s, a) => s + Number(a.moving_time ?? 0), 0);
      const sports = Array.from(new Set(subset.map((a) => a.sport_type))).join(", ");
      const avgPace = fmtPace(runKm * 1000, runSec);
      return `${subset.length} pass (${runs.length} löp) • ${totalKm.toFixed(0)} km totalt • löp ${runKm.toFixed(0)} km @ snitt ${avgPace} • sporter: ${sports || "–"}`;
    };
    const aggregateStr = buckets
      .map((b) => `- ${b.label}: ${summarize(b.days)}`)
      .join("\n");

    const liveContext = `═══════════════════════════════════
AKTUELL KONTEXT (${todayLabel})
═══════════════════════════════════

- Idag är ${todayLabel}
- Dagens rekommendation: ${planContext.todayPlan}
- ACWR: ${planContext.acwr ?? "–"} | TSB: ${planContext.tsb ?? "–"} ${tsbLabel}
- Dagar till loppet: ${planContext.daysToRace}
- Senaste pass: ${planContext.lastRun}

TRÄNINGSHISTORIK (aggregerad från Strava):
${aggregateStr}

PASS SENASTE 28 DAGARNA (från Strava):
${recentActsStr}



`;



    const system = liveContext + `Du är Pirrecoachen – en personlig tränings- och löpcoach för {{NAME}}, {{AGE}} år. Du kombinerar vetenskaplig träningslära med praktisk erfarenhet och anpassar alltid dina råd till {{NAME_POSS}} faktiska data.

STILREGLER (viktigast av allt):
- Svara MAX 3–5 meningar. Ett tydligt beslut + en konkret rekommendation.
- Nämn ALDRIG studier, författarnamn (Schwellnus, Seiler, Gabbett, Tanaka, Pfitzinger, Bompa, Daniels…), forskningsbegrepp (neuromuskulär trötthet, superkompensation, kapillärtäthet, polariserad träning, periodisering, ACWR-zon…) eller fysiologiska mekanismer om {{NAME}} inte explicit frågar "varför". Översätt direkt till beslut.
- Du får referera till siffror som ACWR/TSB i klartext ("du är pigg", "belastningen är hög"), inte som forskningsbegrepp.
- Bara om {{NAME}} explicit ber om förklaring, motivering, vetenskap eller "varför" → då får du fördjupa.

MINNE OCH KONTINUITET:
- Du har full tillgång till de senaste 7 dagarnas konversation ovan (äldre meddelanden är prefixade med [veckodag MM-DD]).
- Referera till tidigare beslut och resonemang när det är relevant ("som vi sa i går", "du nämnde i tisdags att…").
- Upprepa ALDRIG samma fråga, råd eller varning som redan besvarats de senaste dagarna.

ATLETENS VAL ÄR DATA, INTE OLYDNAD:
- Om {{NAME}} valde löpning när planen sa vila (eller tvärtom) → behandla det som ett val, inte en avvikelse.
- Klaga ALDRIG på att planen inte följdes. Säg inte "du avvek från planen" eller "du skulle ha vilat".
- Anpassa istället nästa pass utifrån vad som faktiskt gjordes.
`;


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
        system: personalizePrompt(system),
        messages,
      }),
    });

    const json = (await res.json()) as {
      content?: { text?: string }[];
    };
    const responseText = json.content?.[0]?.text ?? "Kunde inte generera svar.";

    const replanMatch = responseText.match(/REPLAN:(\{[\s\S]*\})/);
    const cleanResponse = responseText.replace(/\s*REPLAN:\{[\s\S]*\}\s*$/, "").trim();
    // Replan bara när valet faktiskt ändrats — annars triggar varje upprepning
    // (t.ex. "ok jag tar löpning" två gånger) en ny plan utan ny data.
    const triggersReplan = !!replanMatch || choiceChanged;

    await supabaseAdmin.from("coach_conversations").insert({
      date: dateStr,
      role: "coach",
      content: cleanResponse,
      triggers_replan: triggersReplan,
    });

    if (triggersReplan) {
      try {
        await generatePlan({ data: { force: true } });
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

