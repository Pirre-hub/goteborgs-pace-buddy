// ACWR coach + 14-day rolling plan
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { backfillRecentRuns } from "./strava.server";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type PlanDay = {
  day_offset: number; // 0 = idag
  weekday: string; // "Mån"
  date: string; // ISO yyyy-mm-dd
  type: string; // "Lugn distans", "Intervaller", "Vila"...
  distance_km: number | null;
  target_pace: string;
  purpose: string;
};

export type CoachPlan = {
  commentary: string;
  acwr: number | null;
  acwr_zone: "low" | "optimal" | "high" | "danger" | null;
  plan: PlanDay[];
  computed_at: string;
  based_on_run?: { date: string; distance_km: number; pace: string };
};

const TOOL = {
  type: "function" as const,
  function: {
    name: "rolling_plan",
    description: "ACWR-baserad coach-kommentar + 14 dagars träningsplan.",
    parameters: {
      type: "object",
      properties: {
        commentary: {
          type: "string",
          description:
            "2-4 meningar prestationsanalys senaste 7 dagar + hur planen anpassas. Svenska, varm peppande ton.",
        },
        plan: {
          type: "array",
          minItems: 14,
          maxItems: 14,
          items: {
            type: "object",
            properties: {
              day_offset: { type: "number" },
              weekday: { type: "string" },
              date: { type: "string" },
              type: { type: "string" },
              distance_km: { type: ["number", "null"] },
              target_pace: { type: "string" },
              purpose: { type: "string" },
            },
            required: [
              "day_offset",
              "weekday",
              "date",
              "type",
              "distance_km",
              "target_pace",
              "purpose",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["commentary", "plan"],
      additionalProperties: false,
    },
  },
};

function tssFor(distance_km: number, paceSecPerKm: number, ftPace: number) {
  const intensity = ftPace / paceSecPerKm;
  const hours = (distance_km * paceSecPerKm) / 3600;
  return Math.round(hours * intensity * intensity * 100);
}

function calcACWR(
  runs: Array<{ start_date_local: string; distance: number; moving_time: number }>,
  goalPaceSec: number,
): { acwr: number | null; acute: number; chronic: number; zone: CoachPlan["acwr_zone"] } {
  const ft = goalPaceSec * 1.06;
  const now = Date.now();
  let acute = 0;
  let chronic = 0;
  for (const r of runs) {
    const t = new Date(r.start_date_local).getTime();
    const ageDays = (now - t) / 86400000;
    if (ageDays < 0 || ageDays > 28) continue;
    const distKm = Number(r.distance) / 1000;
    if (distKm < 0.5) continue;
    const pace = Number(r.moving_time) / distKm;
    const tss = tssFor(distKm, pace, ft);
    if (ageDays <= 7) acute += tss;
    chronic += tss;
  }
  const acuteAvg = acute / 7;
  const chronicAvg = chronic / 28;
  const acwr = chronicAvg > 0 ? +(acuteAvg / chronicAvg).toFixed(2) : null;
  let zone: CoachPlan["acwr_zone"] = null;
  if (acwr != null) {
    if (acwr < 0.8) zone = "low";
    else if (acwr <= 1.3) zone = "optimal";
    else if (acwr <= 1.5) zone = "high";
    else zone = "danger";
  }
  return { acwr, acute: Math.round(acuteAvg), chronic: Math.round(chronicAvg), zone };
}

export function calcCTL_ATL_TSB(
  runs: Array<{ start_date_local: string; distance: number; moving_time: number }>,
  goalPaceSec: number,
  daysHistory: number = 365,
): {
  ctl: number;
  atl: number;
  tsb: number;
  tssToday: number;
  trend: Array<{ date: string; ctl: number; atl: number; tsb: number }>;
} {
  const ft = goalPaceSec * 1.06;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyTSS: Record<string, number> = {};
  for (const r of runs) {
    const dateKey = r.start_date_local.slice(0, 10);
    const distKm = Number(r.distance) / 1000;
    if (distKm < 0.5) continue;
    const pace = Number(r.moving_time) / distKm;
    const tss = tssFor(distKm, pace, ft);
    dailyTSS[dateKey] = (dailyTSS[dateKey] ?? 0) + tss;
  }

  const k42 = 2 / (42 + 1);
  const k7 = 2 / (7 + 1);

  let ctl = 0;
  let atl = 0;
  const trend: Array<{ date: string; ctl: number; atl: number; tsb: number }> = [];

  for (let i = daysHistory; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const tss = dailyTSS[key] ?? 0;
    ctl = ctl + k42 * (tss - ctl);
    atl = atl + k7 * (tss - atl);
    trend.push({
      date: key,
      ctl: +ctl.toFixed(1),
      atl: +atl.toFixed(1),
      tsb: +(ctl - atl).toFixed(1),
    });
  }

  const tssToday = dailyTSS[today.toISOString().slice(0, 10)] ?? 0;
  return {
    ctl: +ctl.toFixed(1),
    atl: +atl.toFixed(1),
    tsb: +(ctl - atl).toFixed(1),
    tssToday,
    trend,
  };
}

export async function getTrainingLoadData() {
  const [{ data: acts }, { data: goal }] = await Promise.all([
    supabaseAdmin
      .from("strava_activities")
      .select("start_date_local, distance, moving_time")
      .order("start_date_local", { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from("race_goal")
      .select("goal_pace_sec")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const goalPace = goal?.goal_pace_sec ?? 360;
  const runs = (acts ?? []).map((r) => ({
    start_date_local: String(r.start_date_local),
    distance: Number(r.distance),
    moving_time: Number(r.moving_time),
  }));
  return calcCTL_ATL_TSB(runs, goalPace);
}

const WEEKDAYS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];

export async function getCachedPlan(): Promise<CoachPlan | null> {
  const { data } = await supabaseAdmin
    .from("coach_plan")
    .select("commentary, acwr, acwr_zone, plan, computed_at, based_on_run")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  return {
    commentary: data.commentary,
    acwr: data.acwr != null ? Number(data.acwr) : null,
    acwr_zone: (data.acwr_zone as CoachPlan["acwr_zone"]) ?? null,
    plan: (data.plan as PlanDay[]) ?? [],
    computed_at: data.computed_at,
    based_on_run:
      (data.based_on_run as CoachPlan["based_on_run"]) ?? undefined,
  };
}

export async function invalidatePlan() {
  await supabaseAdmin.from("coach_plan").delete().eq("id", 1);
}

export async function generatePlan(): Promise<CoachPlan> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY saknas");

  // Ensure the coach is based on the latest Strava data even if the webhook
  // has not delivered or processed the newest activity yet.
  await backfillRecentRuns();

  const [{ data: goal }, { data: acts }] = await Promise.all([
    supabaseAdmin
      .from("race_goal")
      .select("name, race_date, distance_km, goal_pace_sec")
      .eq("is_active", true)
      .maybeSingle(),
    supabaseAdmin
      .from("strava_activities")
      .select(
        "start_date_local, distance, moving_time, average_heartrate, name",
      )
      .order("start_date_local", { ascending: false })
      .limit(40),
  ]);

  const goalPace = goal?.goal_pace_sec ?? 360;
  const runs = (acts ?? []).map((r) => ({
    start_date_local: String(r.start_date_local),
    distance: Number(r.distance),
    moving_time: Number(r.moving_time),
    average_heartrate: r.average_heartrate ? Number(r.average_heartrate) : null,
    name: r.name,
  }));

  const { acwr, acute, chronic, zone } = calcACWR(runs, goalPace);

  // Använd Europe/Stockholm för "idag" så AI:n inte tror att svenskt
  // kvällspass är från igår (UTC ligger 1-2 h efter).
  const localTodayStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const today = new Date(`${localTodayStr}T00:00:00`);
  const upcomingDates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const dateStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    upcomingDates.push(`${i}|${WEEKDAYS[d.getDay()]}|${dateStr}`);
  }

  const last7 = runs.slice(0, 7);
  const last7Lines = last7
    .map((r) => {
      const distKm = r.distance / 1000;
      const paceSec = distKm > 0 ? r.moving_time / distKm : 0;
      const paceMin = Math.floor(paceSec / 60);
      const paceSecs = Math.round(paceSec % 60).toString().padStart(2, "0");
      const pace = distKm > 0.5 ? `${paceMin}:${paceSecs}/km` : "–";
      const hr = r.average_heartrate ? `, puls ${Math.round(r.average_heartrate)}` : "";
      const name = r.name ? ` (${r.name})` : "";
      return `- ${r.start_date_local.slice(0, 10)}${name}: ${distKm.toFixed(1)} km @ ${pace}${hr}`;
    })
    .join("\n");

  const latestRun = runs[0] ?? null;
  const based_on_run = latestRun
    ? {
        date: latestRun.start_date_local.slice(0, 10),
        distance_km: +(latestRun.distance / 1000).toFixed(1),
        pace: (() => {
          const s = latestRun.moving_time / (latestRun.distance / 1000);
          return `${Math.floor(s / 60)}:${Math.round(s % 60)
            .toString()
            .padStart(2, "0")}/km`;
        })(),
      }
    : undefined;

  const goalLine = goal
    ? `Mål: ${goal.name} ${goal.distance_km} km @ ${Math.floor(goalPace / 60)}:${(goalPace % 60).toString().padStart(2, "0")}/km, ${Math.max(0, Math.round((new Date(goal.race_date + "T00:00:00").getTime() - Date.now()) / 86400000))} dagar kvar.`
    : "Inget mål satt.";

  const system = `Du är en erfaren svensk löp- och träningscoach med 20 års erfarenhet av att coacha motionslöpare 50–70 år. Du kombinerar vetenskaplig träningslära med praktisk erfarenhet.

ATLETEN DU COACHAR:

- Per, 64 år, man, 74 kg, 180 cm

- Tränar regelbundet 3–4 gånger/vecka, mestadels löpning

- Van motionslöpare, har sprungit halvmaraton tidigare

- Mål-pace Göteborgsvarvet: 6:10/km, ca 2:10 halvmaraton

- Age-grade: ~67% (Local class, nära Regional vid 70%)

- Max HR ca 156 (211 - 0.64 × 64)

ACWR-TOLKNING:

- <0.8: Undertränad – öka volym försiktigt

- 0.8–1.3: Optimal zon – sweet spot för anpassning

- 1.3–1.5: Hög belastning – prioritera lugna pass, skaderisk ökar

- >1.5: Farozon – vila eller mycket lätt aktivitet

PASSTYPER OCH SYFTE:

- Återhämtningsjogg (>7:00/km, 60–65% max HR): aktiv återhämtning, dagen efter hårt pass

- Lugn distans (6:20–6:45/km, 70–75% max HR): aerob bas, viktigaste passtypen, ~75% av total volym

- Tröskelintervaller (5:30–5:50/km, 85–90% max HR): förbättrar laktattröskel, max 1 gång/vecka

- Fartlek (varierat): blandar intensiteter, mentalt stimulerande

- Långpass (6:20–6:40/km, 70–75% max HR): bygger uthållighet, max 1 gång/vecka, INTE sista 10 dagarna innan lopp

- Vila: minst 1–2 dagar/vecka, absolut nödvändigt för adaptation

COACHREGLER – MÅSTE FÖLJAS:

1. Börja commentary med att nämna senaste passets datum, distans OCH tempo explicit

2. Analysera vad tempot och distansen signalerar – var det snabbare/långsammare än målpace? Hur lång distans relativt vad kroppen klarar?

3. Förklara direkt hur senaste passet påverkar MORGONDAGENS rekommendation

4. Använd ACWR-zonen för att motivera veckans volym och intensitet

5. Med <14 dagar till lopp: ingen maxbelastning, fokus på att bevara formen

6. Med <7 dagar till lopp: bara korta aktiveringspass, prioritera vila

7. purpose-fältet för varje pass MÅSTE förklara VARFÖR just detta pass på just denna dag – specifikt, inte generiskt`;

  const latestRunRelative = based_on_run
    ? (() => {
        const diff = Math.round(
          (today.getTime() - new Date(based_on_run.date).getTime()) / 86400000,
        );
        if (diff <= 0) return "idag";
        if (diff === 1) return "igår";
        return `för ${diff} dagar sedan`;
      })()
    : null;

  const raceDateStr = goal?.race_date ?? null;
  const raceDayLine = raceDateStr
    ? (() => {
        const rd = new Date(`${raceDateStr}T00:00:00`);
        const diff = Math.round(
          (rd.getTime() - today.getTime()) / 86400000,
        );
        return `LOPPDAGEN: ${raceDateStr} (${WEEKDAYS[rd.getDay()]}), om ${diff} dagar.`;
      })()
    : "";

  // Pass redan körda idag (lokal tid) – planen för day_offset 0 ska reflektera detta.
  const todayRuns = runs.filter(
    (r) => r.start_date_local.slice(0, 10) === localTodayStr,
  );
  const todayKm = todayRuns.reduce((s, r) => s + r.distance / 1000, 0);
  const todayLine =
    todayRuns.length > 0
      ? `IDAG REDAN GENOMFÖRT: ${todayKm.toFixed(1)} km (${todayRuns.length} pass). day_offset 0 MÅSTE markeras som "Genomfört: ${todayKm.toFixed(1)} km" (type) med distance_km=${todayKm.toFixed(1)}, target_pace="–", och purpose som bekräftar passet. Flytta planerad vila/lugnt pass till day_offset 1 (imorgon) istället, och justera resten av veckan därefter så belastningen blir balanserad.`
      : `INGA PASS IDAG ÄNNU: day_offset 0 är fortfarande planerbart.`;

  const user = `Datum idag: ${today.toISOString().slice(0, 10)}

${goalLine}

Dagar till lopp: ${Math.max(0, Math.round((new Date((goal?.race_date ?? today) + "T00:00:00").getTime() - Date.now()) / 86400000))}

TRÄNINGSBELASTNING:

- ACWR: ${acwr ?? "–"} (zon: ${zone ?? "okänd"})

- Akut snitt: ${acute} TSS/dag (senaste 7 dagar)

- Kronisk snitt: ${chronic} TSS/dag (senaste 28 dagar)

SENASTE ${last7.length} PASS (inkl tempo och pulsdata):

${last7Lines || "(inga pass)"}

KOMMANDE 14 DAGAR (day_offset|weekday|date):

${upcomingDates.join("\n")}

Generera commentary (3–5 meningar, börja med senaste passets datum + tempo) + 14 pass via rolling_plan. Varje purpose ska vara 2–3 meningar som förklarar VARFÖR just detta pass just denna dag, kopplat till ACWR och dagar till lopp.`;

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "rolling_plan" } },
    }),
  });

  if (res.status === 429)
    throw new Error("AI:n är överbelastad. Försök igen om en stund.");
  if (res.status === 402)
    throw new Error("AI-krediterna är slut. Fyll på i Settings.");
  if (!res.ok) throw new Error(`AI-fel [${res.status}]: ${await res.text()}`);

  const json = await res.json();
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returnerade inget svar");
  const parsed = JSON.parse(args) as {
    commentary: string;
    plan: PlanDay[];
  };

  const computed_at = new Date().toISOString();
  await supabaseAdmin.from("coach_plan").upsert(
    {
      id: 1,
      commentary: parsed.commentary,
      acwr,
      acwr_zone: zone,
      plan: parsed.plan as never,
      computed_at,
      based_on_run: (based_on_run ?? null) as never,
    },
    { onConflict: "id" },
  );

  return {
    commentary: parsed.commentary,
    acwr,
    acwr_zone: zone,
    plan: parsed.plan,
    computed_at,
    based_on_run,
  };
}
