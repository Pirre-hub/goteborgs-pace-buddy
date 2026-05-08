// Daily briefing: AI generates a single morning message for today.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type BriefingWorkout = {
  type: string;
  distance_km: number | null;
  target_pace: string;
  focus: string;
};

export type Briefing = {
  date: string;
  content: string;
  workout: BriefingWorkout | null;
};

const TOOL = {
  type: "function" as const,
  function: {
    name: "morning_briefing",
    description: "Personlig morgonrapport på svenska + dagens pass.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "2-4 meningar morgonbriefing. Kort, varm ton. Nämn TSB/form, dagens fokus, väder om relevant.",
        },
        workout: {
          type: "object",
          properties: {
            type: { type: "string" },
            distance_km: { type: ["number", "null"] },
            target_pace: { type: "string" },
            focus: { type: "string" },
          },
          required: ["type", "distance_km", "target_pace", "focus"],
          additionalProperties: false,
        },
      },
      required: ["content", "workout"],
      additionalProperties: false,
    },
  },
};

export async function getTodayBriefing(): Promise<Briefing | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("briefings")
    .select("date, content, workout")
    .eq("date", today)
    .maybeSingle();
  if (!data) return null;
  return {
    date: data.date,
    content: data.content,
    workout: (data.workout as BriefingWorkout | null) ?? null,
  };
}

async function fetchGoteborgWeather(): Promise<string> {
  // SMHI open API for Göteborg (lat 57.7, lon 11.97)
  try {
    const res = await fetch(
      "https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/11.97/lat/57.71/data.json",
      { headers: { "User-Agent": "pirrecoachen/1.0" } },
    );
    if (!res.ok) return "okänt";
    const json = (await res.json()) as {
      timeSeries: Array<{
        validTime: string;
        parameters: Array<{ name: string; values: number[] }>;
      }>;
    };
    const today = new Date();
    const morning = json.timeSeries.find((t) => {
      const d = new Date(t.validTime);
      return (
        d.getDate() === today.getDate() &&
        d.getHours() >= 7 &&
        d.getHours() <= 10
      );
    });
    if (!morning) return "okänt";
    const temp = morning.parameters.find((p) => p.name === "t")?.values[0];
    const wind = morning.parameters.find((p) => p.name === "ws")?.values[0];
    const precip = morning.parameters.find((p) => p.name === "pmean")?.values[0];
    return `${temp != null ? Math.round(temp) + "°C" : "?"}, vind ${wind != null ? Math.round(wind) + " m/s" : "?"}${precip && precip > 0.1 ? `, regn ${precip.toFixed(1)} mm/h` : ""}`;
  } catch {
    return "okänt";
  }
}

export async function generateBriefing(): Promise<Briefing> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY saknas");

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: goal }, { data: load }, { data: recent }, weather] =
    await Promise.all([
      supabaseAdmin
        .from("race_goal")
        .select("name, race_date, distance_km, goal_pace_sec")
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("training_load")
        .select("ctl, atl, tsb")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("strava_activities")
        .select("start_date_local, distance, moving_time, average_heartrate")
        .order("start_date_local", { ascending: false })
        .limit(7),
      fetchGoteborgWeather(),
    ]);

  const goalLine = goal
    ? `Mål: ${goal.name} ${goal.distance_km} km @ ${Math.floor(goal.goal_pace_sec / 60)}:${(goal.goal_pace_sec % 60).toString().padStart(2, "0")}/km, ${Math.max(0, Math.round((new Date(goal.race_date).getTime() - Date.now()) / 86400000))} dagar kvar.`
    : "Inget mål satt.";

  const loadLine = load
    ? `CTL ${load.ctl} (form), ATL ${load.atl} (trötthet), TSB ${load.tsb} (${Number(load.tsb) > 5 ? "frisk" : Number(load.tsb) < -10 ? "trött" : "balanserad"}).`
    : "Ingen träningsbelastning beräknad ännu.";

  const recentLines = (recent ?? [])
    .map((r) => {
      const km = (Number(r.distance) / 1000).toFixed(1);
      const min = Math.round(Number(r.moving_time) / 60);
      return `- ${String(r.start_date_local).slice(0, 10)}: ${km} km, ${min} min${r.average_heartrate ? `, puls ${Math.round(Number(r.average_heartrate))}` : ""}`;
    })
    .join("\n");

  const system = `Du är en personlig löpcoach som skickar en kort morgonbriefing kl 06:30. Varm, peppande, datadriven ton. Svenska. Använd TSB för att avgöra om idag ska vara hård/lugn/vila.`;
  const user = `Datum: ${today}
${goalLine}
${loadLine}
Väder Göteborg morgon: ${weather}

Senaste 7 pass:
${recentLines || "(inga pass cachade)"}

Returnera dagens briefing + rekommenderat pass via verktyget morning_briefing.`;

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
      tool_choice: { type: "function", function: { name: "morning_briefing" } },
    }),
  });

  if (!res.ok) throw new Error(`AI-fel [${res.status}]: ${await res.text()}`);
  const json = await res.json();
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returnerade inget svar");
  const parsed = JSON.parse(args) as {
    content: string;
    workout: BriefingWorkout;
  };

  await supabaseAdmin.from("briefings").upsert(
    {
      date: today,
      content: parsed.content,
      workout: parsed.workout as never,
    },
    { onConflict: "date" },
  );

  return { date: today, content: parsed.content, workout: parsed.workout };
}
