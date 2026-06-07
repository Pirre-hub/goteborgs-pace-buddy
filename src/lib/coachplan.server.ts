// ACWR coach + 14-day rolling plan
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { backfillRecentRuns } from "./strava.server";

const AI_URL = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-6";

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
            duration_min: { type: ["number", "null"] },
            target_pace: { type: "string" },
            purpose: { type: "string" },
          },
          required: [
            "day_offset",
            "weekday",
            "date",
            "type",
            "distance_km",
            "duration_min",
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

  const [{ data: goal }, { data: acts }, { data: choices }] = await Promise.all([
    supabaseAdmin
      .from("race_goal")
      .select("name, race_date, distance_km, goal_pace_sec")
      .eq("is_active", true)
      .maybeSingle(),
    supabaseAdmin
      .from("strava_activities")
      .select(
        "id, name, type, start_date_local, distance, moving_time, average_heartrate, splits",
      )
      .order("start_date_local", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("daily_choices")
      .select("date, recommended_type, actual_choice")
      .order("date", { ascending: false })
      .limit(14),
  ]);

  const deviations = (choices ?? [])
    .filter(
      (c) =>
        c.actual_choice &&
        c.actual_choice !== c.recommended_type &&
        c.actual_choice !== "rest",
    )
    .map(
      (c) =>
        `${c.date}: rekommenderade ${c.recommended_type}, valde ${c.actual_choice}`,
    );

  const consecutiveDeviations = (() => {
    let count = 0;
    for (const c of choices ?? []) {
      if (c.actual_choice && c.actual_choice !== c.recommended_type) count++;
      else break;
    }
    return count;
  })();

  const goalPace = goal?.goal_pace_sec ?? 360;
  const runs = (acts ?? []).map((r) => ({
    start_date_local: String(r.start_date_local),
    distance: Number(r.distance),
    moving_time: Number(r.moving_time),
    average_heartrate: r.average_heartrate ? Number(r.average_heartrate) : null,
    name: r.name,
    type: (r as { type?: string }).type ?? null,
    splits: (r as { splits?: unknown }).splits ?? null,
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

  // Build splits summary for last running activities with splits data
  type SplitRow = {
    split: number;
    distance: number;
    moving_time: number;
    average_speed: number;
    average_heartrate?: number;
  };
  const runsWithSplits = runs
    .filter((r) => {
      const cat = ["Run", "TrailRun", "VirtualRun"].includes(r.type ?? "");
      const splits = r.splits as SplitRow[] | null;
      return cat && Array.isArray(splits) && splits.length > 0;
    })
    .slice(0, 3);

  const splitsLines = runsWithSplits
    .map((r) => {
      const splits = (r.splits as SplitRow[]) ?? [];
      const distKm = (r.distance / 1000).toFixed(1);
      const date = r.start_date_local.slice(0, 10);
      const name = r.name ?? "Pass";
      const splitDetail = splits
        .map((s) => {
          const splitPaceSec = s.moving_time / (s.distance / 1000);
          const pm = Math.floor(splitPaceSec / 60);
          const ps = Math.round(splitPaceSec % 60).toString().padStart(2, "0");
          const hr = s.average_heartrate
            ? ` (${Math.round(s.average_heartrate)}bpm)`
            : "";
          return `    km${s.split}: ${pm}:${ps}/km${hr}`;
        })
        .join("\n");
      return `${date} – ${name} (${distKm}km):\n${splitDetail}`;
    })
    .join("\n\n");

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

- Nuvarande åldersgradering: cirka 67% (bra motionsnivå, siktar mot stark nivå vid 70%)

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

10. PERSONALISERING: avsluta alltid med hur rådet specifikt relaterar till Pers mål och kramperfarenheten

11. SPLITS-ANALYS: om km-splits finns tillgängliga, analysera alltid pace-fördelningen. Ojämn pace (snabb start, avtagande slut) är det vanligaste misstaget vid halvmaraton och direkt kopplat till kramper. Påpeka om Per springer för snabbt tidigt.`;


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

  const todayChoice = (choices ?? []).find((c) => c.date === localTodayStr);
  const todayChoiceLine = todayChoice?.actual_choice
    ? `PERS VAL IDAG: "${todayChoice.actual_choice}". day_offset 0 MÅSTE reflektera detta val. Justera resten av veckan så total belastning stämmer.`
    : "";

  const user = `Datum idag: ${today.toISOString().slice(0, 10)}

${goalLine}

${raceDayLine}

Dagar till lopp: ${Math.max(0, Math.round((new Date((goal?.race_date ?? today) + "T00:00:00").getTime() - Date.now()) / 86400000))}

${todayLine}

${todayChoiceLine}

${latestRunRelative ? `Senaste pass var ${latestRunRelative}.` : ""}

TRÄNINGSBELASTNING:

- ACWR: ${acwr ?? "–"} (zon: ${zone ?? "okänd"})

- Akut snitt: ${acute} TSS/dag (senaste 7 dagar)

- Kronisk snitt: ${chronic} TSS/dag (senaste 28 dagar)

SENASTE ${last7.length} PASS (inkl tempo och pulsdata):

${last7Lines || "(inga pass)"}
${splitsLines ? `\nKM-SPLITS SENASTE LÖPPASS:\n${splitsLines}\n\nAnalysera pace-fördelningen: springer Per jämnt eller för snabbt i början? Ser du tecken på trötthet (avtagande pace sista km)?\n` : ""}

KOMMANDE 14 DAGAR (day_offset|weekday|date):

${upcomingDates.join("\n")}

Generera commentary (3–5 meningar, börja med senaste passets datum + tempo) + 14 pass via rolling_plan. Varje purpose ska vara 2–3 meningar som förklarar VARFÖR just detta pass just denna dag, kopplat till ACWR och dagar till lopp.

KONTROLL INNAN DU SVARAR: räkna dina 14 dagar – det MÅSTE finnas exakt 2 gympass (type innehåller "Gym") och max 6 löppass totalt. Resten är vila. Om inte – gör om planen.${deviations.length > 0 ? `\n\nAVVIKELSER SENASTE 14 DAGAR:\n${deviations.join("\n")}` : ""}${consecutiveDeviations >= 3 ? `\n\nVARNING: Atleten har avvikit från rekommendationen ${consecutiveDeviations} dagar i rad. Påtala detta direkt i commentary – fråga om det är skada, trötthet eller motivation och anpassa planen därefter.` : ""}`;


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

  const gymCount = parsed.plan.filter((d) =>
    /gym|styrka|strength/i.test(d.type),
  ).length;
  const runCount = parsed.plan.filter(
    (d) => !/gym|styrka|strength|vila|rest/i.test(d.type),
  ).length;
  console.log(
    `[CoachPlan] generated 14d: ${runCount} löp, ${gymCount} gym, ${14 - runCount - gymCount} vila`,
  );
  if (gymCount < 2) {
    console.warn("[CoachPlan] AI skipped gym days, expected 2 got", gymCount);
  }

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
