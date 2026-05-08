// Pace DNA: AI-driven personality analysis of training pattern. Cached 24h.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type DnaInsight = {
  emoji: string;
  title: string;
  detail: string;
};

export type DnaResult = {
  insights: DnaInsight[];
  computed_at: string;
};

const TOOL = {
  type: "function" as const,
  function: {
    name: "pace_dna",
    description:
      "Hitta 4-6 personliga mönster i löparens träning. Konkreta, datadrivna insikter på svenska.",
    parameters: {
      type: "object",
      properties: {
        insights: {
          type: "array",
          minItems: 4,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              emoji: { type: "string", description: "1 emoji som ikon" },
              title: { type: "string", description: "Kort titel, max 8 ord" },
              detail: { type: "string", description: "1-2 meningar med konkret data och rekommendation" },
            },
            required: ["emoji", "title", "detail"],
            additionalProperties: false,
          },
        },
      },
      required: ["insights"],
      additionalProperties: false,
    },
  },
};

function paceStr(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export async function getCachedDna(): Promise<DnaResult | null> {
  const { data } = await supabaseAdmin
    .from("pace_dna")
    .select("insights, computed_at")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  const ageMs = Date.now() - new Date(data.computed_at).getTime();
  if (ageMs > 24 * 3600 * 1000) return null;
  return {
    insights: data.insights as DnaInsight[],
    computed_at: data.computed_at,
  };
}

export async function computeDna(): Promise<DnaResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY saknas");

  const { data: acts } = await supabaseAdmin
    .from("strava_activities")
    .select(
      "id, name, distance, moving_time, start_date_local, average_heartrate, max_heartrate, total_elevation_gain, splits",
    )
    .order("start_date_local", { ascending: false })
    .limit(30);

  if (!acts || acts.length < 5) {
    throw new Error("Behöver minst 5 cache:ade pass. Kör backfill först.");
  }

  const summary = acts.map((a) => {
    const distKm = Number(a.distance) / 1000;
    const pace = Number(a.moving_time) / distKm;
    const date = String(a.start_date_local);
    const hour = parseInt(date.slice(11, 13), 10);
    const dow = new Date(date).getDay(); // 0=sön
    const splits = a.splits as Array<{ average_speed: number; distance: number }> | null;
    const splitPaces = splits?.map((s) => 1000 / s.average_speed) ?? [];
    const fade =
      splitPaces.length >= 4
        ? splitPaces[splitPaces.length - 1] - splitPaces[0]
        : null;
    return {
      date: date.slice(0, 10),
      hour,
      dow,
      km: +distKm.toFixed(2),
      pace_sec: Math.round(pace),
      pace: paceStr(pace),
      hr: a.average_heartrate ? Math.round(Number(a.average_heartrate)) : null,
      max_hr: a.max_heartrate ? Math.round(Number(a.max_heartrate)) : null,
      elev: a.total_elevation_gain ? Math.round(Number(a.total_elevation_gain)) : 0,
      n_splits: splits?.length ?? 0,
      fade_sec_per_km: fade !== null ? Math.round(fade) : null,
    };
  });

  const system = `Du är dataanalytiker för en löpare. Hitta 4-6 KONKRETA mönster baserat på datan – t.ex. "Du är X% snabbare på morgonpass", "Din puls stiger Y bpm mer i backar", "Tisdag är din starkaste dag", "Du fadear genomsnittligt Z sek/km på pass över A km", "Efter ett vilodag är du Y sek/km snabbare". Använd faktiska siffror från datan. Inga generiska råd.`;

  const user = `Senaste ${summary.length} pass (JSON):
${JSON.stringify(summary, null, 1)}

Returnera 4-6 personliga insikter via verktyget pace_dna.`;

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
      tool_choice: { type: "function", function: { name: "pace_dna" } },
    }),
  });

  if (res.status === 429) throw new Error("AI:n är överbelastad. Försök igen snart.");
  if (res.status === 402) throw new Error("AI-krediterna är slut.");
  if (!res.ok) throw new Error(`AI-fel [${res.status}]: ${await res.text()}`);

  const json = await res.json();
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returnerade inget svar");
  const parsed = JSON.parse(args) as { insights: DnaInsight[] };

  const computed_at = new Date().toISOString();
  await supabaseAdmin.from("pace_dna").upsert({
    id: 1,
    insights: parsed.insights as never,
    computed_at,
  });

  return { insights: parsed.insights, computed_at };
}
