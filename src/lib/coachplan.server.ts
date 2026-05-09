// ACWR coach + 14-day rolling plan
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

const WEEKDAYS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];

export async function getCachedPlan(): Promise<CoachPlan | null> {
  const { data } = await supabaseAdmin
    .from("coach_plan")
    .select("commentary, acwr, acwr_zone, plan, computed_at")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  return {
    commentary: data.commentary,
    acwr: data.acwr != null ? Number(data.acwr) : null,
    acwr_zone: (data.acwr_zone as CoachPlan["acwr_zone"]) ?? null,
    plan: (data.plan as PlanDay[]) ?? [],
    computed_at: data.computed_at,
  };
}

export async function invalidatePlan() {
  await supabaseAdmin.from("coach_plan").delete().eq("id", 1);
}

export async function generatePlan(): Promise<CoachPlan> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY saknas");

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

  const today = new Date();
  const upcomingDates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    upcomingDates.push(
      `${i}|${WEEKDAYS[d.getDay()]}|${d.toISOString().slice(0, 10)}`,
    );
  }

  const last7 = runs.slice(0, 7);
  const last7Lines = last7
    .map(
      (r) =>
        `- ${r.start_date_local.slice(0, 10)}: ${(r.distance / 1000).toFixed(1)} km, ${Math.round(r.moving_time / 60)} min${r.average_heartrate ? `, puls ${Math.round(r.average_heartrate)}` : ""}`,
    )
    .join("\n");

  const goalLine = goal
    ? `Mål: ${goal.name} ${goal.distance_km} km @ ${Math.floor(goalPace / 60)}:${(goalPace % 60).toString().padStart(2, "0")}/km, ${Math.max(0, Math.round((new Date(goal.race_date).getTime() - Date.now()) / 86400000))} dagar kvar.`
    : "Inget mål satt.";

  const system = `Du är en svensk löpcoach specialiserad på ACWR (Acute:Chronic Workload Ratio).
Tolkning av ACWR:
- <0.8 = undertränad, ok att öka
- 0.8-1.3 = optimal "sweet spot"
- 1.3-1.5 = hög skaderisk, lägg in lugna pass
- >1.5 = farozon, vila eller mycket lugn aktivitet

Anpassa planen efter ACWR-zonen. Variera passtyper: lugna distanspass (~75 % av volym), 1 intervall/tröskel/v, 1 långpass/v. Minst 1 vilodag/v.`;

  const user = `Datum idag: ${today.toISOString().slice(0, 10)}
${goalLine}
ACWR: ${acwr ?? "–"} (akut snitt ${acute} TSS/d, kronisk snitt ${chronic} TSS/d, zon: ${zone ?? "okänd"})

Senaste 7 pass:
${last7Lines || "(inga pass cachade)"}

Kommande 14 dagar (day_offset|weekday|date – fyll i pass för varje):
${upcomingDates.join("\n")}

Returnera kommentar (analys av senaste 7 dagar + hur planen anpassas) + 14 pass via verktyget rolling_plan. day_offset 0 = idag.`;

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
    },
    { onConflict: "id" },
  );

  return {
    commentary: parsed.commentary,
    acwr,
    acwr_zone: zone,
    plan: parsed.plan,
    computed_at,
  };
}
