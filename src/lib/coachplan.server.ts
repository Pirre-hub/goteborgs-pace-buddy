// ACWR coach + 14-day rolling plan
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { backfillRecentRuns } from "./strava.server";

const AI_URL = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-5";

export type PlanDay = {
  day_offset: number; // 0 = idag
  weekday: string; // "Mån"
  date: string; // ISO yyyy-mm-dd
  type: string; // "Lugn distans", "Intervaller", "Vila", "Gym (styrka)"...
  distance_km: number | null;
  duration_min: number | null;
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
  name: "rolling_plan",
  description: "ACWR-baserad coach-kommentar + 14 dagars träningsplan.",
  input_schema: {
    type: "object" as const,
    properties: {
      commentary: {
        type: "string",
        description:
          "3-5 meningar prestationsanalys. Nämn senaste passets tempo och distans explicit. Direkt, ärlig, peppande ton – inte defensiv.",
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

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function generatePlan(): Promise<CoachPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY saknas");

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
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    upcomingDates.push(
      `${i}|${WEEKDAYS[d.getDay()]}|${toLocalDateString(d)}`,
    );
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
    ? `Mål: ${goal.name} ${goal.distance_km} km @ ${Math.floor(goalPace / 60)}:${(goalPace % 60).toString().padStart(2, "0")}/km, ${Math.max(0, Math.round((new Date(goal.race_date + "T00:00:00").getTime() - today.getTime()) / 86400000))} dagar kvar.`
    : "Inget mål satt.";

  const system = `Du är en erfaren svensk löp- och träningscoach som coachar Per, 64 år. Du är direkt, ärlig och ambitiös – men du förstår att långsiktig hälsa är viktigare än kortsiktig prestation.

ATLETEN:

- Per, 64 år, 74 kg, 180 cm, van motionslöpare

- Mål: Göteborgsvarvet, förbättra tid och age-grade (nu ~67%)

- Erfarenhet: kramper i quads vid Göteborgsvarvet 2026 – styrka i knän och lår prioriteras

- Max HR ~156 bpm

VECKOSTRUKTUR – FÖLJ ALLTID:

Per tränar 4 pass per vecka: 3 löppass + 1 gympass.

Normalvecka (ingen långpass):

- Mån: Lugnt distanspass 6–8 km, 6:20–6:45/km

- Tis: Vila

- Ons: Kvalitetspass (intervaller eller tröskel) 6–8 km

- Tor: Gym – styrka med fokus på knän och höfter

- Fre: Vila

- Lör: Lugnt distanspass 8–10 km, 6:20–6:40/km

- Sön: Vila

Långpassvecka (varannan vecka, ersätter ett löppass):

- Mån: Vila

- Tis: Lugnt distanspass 6 km

- Ons: Vila

- Tor: Gym – styrka med fokus på knän och höfter

- Fre: Vila

- Lör: Långpass 14–18 km, 6:20–6:40/km

- Sön: Vila

GYMPASS – INNEHÅLL (ange alltid detta i purpose):

Knä- och höftskydd för löpare:

- Knäböj med kroppsvikt eller lätt vikt: 3×15

- Bulgarian split squat: 3×10 per ben

- Hip thrust/glute bridge: 3×15

- Vadpress: 3×20

- Höftabduktion (sidliggande): 3×15

- Plankan: 3×45 sek

Syfte: förebygga kramper och knäproblem, stärka höfter och lår

LÖPPASS-ZONER:

- Lugnt distanspass: 6:20–6:45/km, puls under 140 bpm – INTE 7:00+

- Tröskelpass: 5:40–5:55/km, 3–5 km i tröskeltempo efter uppvärmning

- Intervaller: 5×800m på 5:00–5:20/km med 90 sek vila

- Långpass: 6:20–6:40/km, aldrig snabbare

ACWR-ZONER:

- <0.8: Undertränad – öka löpvolym gradvis, behåll gym

- 0.8–1.3: Optimal – kör fullt program inkl kvalitetspass

- 1.3–1.5: Hög – ersätt kvalitetspass med lugn distans, behåll gym

- >1.5: Farozon – bara gym och promenader

COACHREGLER:

1. Gympasset är ALLTID med oavsett ACWR – det är skadeförebyggande, inte belastande

2. Aldrig mer än 3 löppass per vecka

3. Aldrig två hårda löppass i rad

4. Lugna pass på 6:20–6:45/km – inte 7:00+

5. Nämn senaste passets tempo och distans explicit i commentary

6. Förklara varje pass i purpose: varför just detta pass, varför just denna dag

7. Varannan vecka = långpassvecka, varannan = normalvecka med kvalitetspass`;

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
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "rolling_plan" },
    }),
  });

  if (res.status === 429)
    throw new Error("Claude är överbelastad. Försök igen om en stund.");
  if (res.status === 401) throw new Error("Claude API-nyckeln är ogiltig.");
  if (res.status === 529)
    throw new Error("Claude är överbelastad. Försök igen.");
  if (!res.ok) throw new Error(`AI-fel [${res.status}]: ${await res.text()}`);

  const json = await res.json();
  const toolUse = json.content?.find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse?.input) throw new Error("Claude returnerade inget svar");
  const parsed = toolUse.input as {
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
