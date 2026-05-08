// Server-only training coach helpers
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type RunInput = {
  date: string; // ISO local
  distance_km: number;
  moving_min: number;
  pace_sec_per_km: number;
  avg_hr?: number;
};

export type NextSession = {
  type: string;
  distance_km: number;
  target_pace: string;
  purpose: string;
  why_now: string;
};

export type WeekDay = {
  day: string;
  type: string;
  distance_km: number | null;
  target_pace: string;
  note: string;
};

export type CoachAdvice = {
  next_session: NextSession;
  week_plan: WeekDay[];
  summary: string;
};

const TOOL = {
  type: "function" as const,
  function: {
    name: "training_advice",
    description:
      "Returnera nästa pass + 7 dagars plan på svenska för en löpare som tränar mot Göteborgsvarvet.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "1-2 meningar om belastningen senaste veckorna och vad fokus bör vara nu.",
        },
        next_session: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description:
                "T.ex. 'Lugnt distanspass', 'Intervaller 5x1000m', 'Tröskel', 'Långpass', 'Vila'.",
            },
            distance_km: { type: "number" },
            target_pace: {
              type: "string",
              description: "Måltempo, t.ex. '6:30/km' eller '4:50/km på intervaller'.",
            },
            purpose: { type: "string", description: "Syfte med passet." },
            why_now: {
              type: "string",
              description:
                "Varför just detta pass nu, baserat på senaste pass/belastning.",
            },
          },
          required: ["type", "distance_km", "target_pace", "purpose", "why_now"],
          additionalProperties: false,
        },
        week_plan: {
          type: "array",
          minItems: 7,
          maxItems: 7,
          items: {
            type: "object",
            properties: {
              day: {
                type: "string",
                description: "Dag 1-7 från idag, t.ex. 'Mån', 'Tis'.",
              },
              type: { type: "string" },
              distance_km: { type: ["number", "null"] },
              target_pace: { type: "string" },
              note: { type: "string", description: "Kort kommentar (max ~15 ord)." },
            },
            required: ["day", "type", "distance_km", "target_pace", "note"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "next_session", "week_plan"],
      additionalProperties: false,
    },
  },
};

export async function generateAdvice(runs: RunInput[]): Promise<CoachAdvice> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY saknas");

  const today = new Date();
  const raceDate = new Date("2026-05-23");
  const daysToRace = Math.max(
    0,
    Math.round((raceDate.getTime() - today.getTime()) / 86400000),
  );

  const recent = runs.slice(0, 15);
  const totalKm4w = runs
    .filter(
      (r) =>
        new Date(r.date).getTime() > today.getTime() - 28 * 86400000,
    )
    .reduce((s, r) => s + r.distance_km, 0);

  const lastDate = runs[0]?.date;
  const daysSinceLast = lastDate
    ? Math.round((today.getTime() - new Date(lastDate).getTime()) / 86400000)
    : null;

  const system = `Du är en erfaren svensk löpcoach. Användaren tränar mot Göteborgsvarvet (halvmarathon, 21,1 km) den 23 maj 2026 med målet 6:10/km (sluttid ~2:10:00).

Regler:
- Progressiv överbelastning, max ~10 % volymökning per vecka.
- Minst 1 vilodag per vecka, max 1 långpass per vecka.
- Variera passtyper: lugna distanspass (~75 % av volymen), 1 intervall/tröskelpass, 1 långpass.
- Om senaste pass var hårt eller långt → föreslå lugnt pass eller vila.
- Om volymen varit låg → bygg upp varsamt.
- Anpassa måltempo: lugnt = 6:40-7:10/km, tröskel = 5:30-5:50/km, intervaller = 4:40-5:10/km, långpass = 6:30-6:50/km.
- Skriv allt på svenska, kort och konkret.`;

  const user = `Dagens datum: ${today.toISOString().slice(0, 10)}
Dagar till lopp: ${daysToRace}
Total distans senaste 4 v: ${totalKm4w.toFixed(1)} km
Dagar sedan senaste pass: ${daysSinceLast ?? "okänt"}

Senaste ${recent.length} pass (nyast först):
${recent
  .map(
    (r, i) =>
      `${i + 1}. ${r.date.slice(0, 10)} – ${r.distance_km.toFixed(2)} km på ${Math.round(r.moving_min)} min, tempo ${formatPace(r.pace_sec_per_km)}${r.avg_hr ? `, puls ${Math.round(r.avg_hr)}` : ""}`,
  )
  .join("\n")}

Ge nästa pass + 7-dagars plan via verktyget training_advice.`;

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "training_advice" } },
    }),
  });

  if (res.status === 429) throw new Error("AI:n är överbelastad. Försök igen om en stund.");
  if (res.status === 402) throw new Error("AI-krediterna är slut. Fyll på i Settings → Workspace → Usage.");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI-fel [${res.status}]: ${text}`);
  }

  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("AI returnerade inget verktygssvar.");

  const parsed = JSON.parse(call.function.arguments) as CoachAdvice;
  return parsed;
}

function formatPace(secPerKm: number) {
  if (!secPerKm || !isFinite(secPerKm)) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}
