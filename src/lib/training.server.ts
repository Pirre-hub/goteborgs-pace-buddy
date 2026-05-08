// Training load: rTSS, CTL, ATL, TSB + form-peak prediction
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CTL_TC = 42; // chronic time constant in days
const ATL_TC = 7; // acute time constant in days

// rTSS = duration_h * IF^2 * 100, where IF = NGP / FTPace
// NGP ≈ avg pace (we don't have GAP data without splits-by-grade)
// FTPace = threshold pace in sec/km (~lactate threshold). Approx = goal_pace * 1.06
function calcRTSS(
  movingTimeSec: number,
  avgPaceSecPerKm: number,
  ftPaceSecPerKm: number,
): number {
  if (!movingTimeSec || !avgPaceSecPerKm || !ftPaceSecPerKm) return 0;
  // Lower pace number = faster. Intensity = ftPace / avgPace (faster than threshold = >1)
  const intensity = ftPaceSecPerKm / avgPaceSecPerKm;
  const hours = movingTimeSec / 3600;
  return Math.round(hours * intensity * intensity * 100);
}

export type LoadPoint = {
  date: string;
  daily_tss: number;
  ctl: number;
  atl: number;
  tsb: number;
};

export async function recomputeTrainingLoad(goalPaceSec: number): Promise<{
  points: LoadPoint[];
  peakDate: string | null;
  taperStart: string | null;
}> {
  const ftPace = goalPaceSec * 1.06;

  // Get all cached activities
  const { data: activities } = await supabaseAdmin
    .from("strava_activities")
    .select("id, distance, moving_time, start_date_local, average_speed")
    .order("start_date_local", { ascending: true });

  // Aggregate daily TSS
  const dailyTSS = new Map<string, number>();
  for (const a of activities ?? []) {
    if (!a.start_date_local || !a.distance || !a.moving_time) continue;
    const distKm = Number(a.distance) / 1000;
    if (distKm < 0.5) continue;
    const pace = Number(a.moving_time) / distKm;
    const tss = calcRTSS(Number(a.moving_time), pace, ftPace);
    const date = String(a.start_date_local).slice(0, 10);
    dailyTSS.set(date, (dailyTSS.get(date) ?? 0) + tss);
  }

  // Build a continuous date series from earliest to today + 60 future days for projection
  const sortedDates = Array.from(dailyTSS.keys()).sort();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = sortedDates.length
    ? new Date(sortedDates[0])
    : new Date(today.getTime() - 60 * 86400000);
  const endDate = new Date(today.getTime() + 60 * 86400000);

  // Avg recent daily TSS for projection (last 14 days)
  const recent14 = (() => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      sum += dailyTSS.get(key) ?? 0;
      n++;
    }
    return n ? sum / n : 0;
  })();

  let ctl = 0;
  let atl = 0;
  const points: LoadPoint[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const isFuture = d.getTime() > today.getTime();
    // Future projection: assume constant taper-aware load. Reduce by 50% in last 7 days before race
    let tss = dailyTSS.get(key) ?? 0;
    if (isFuture) tss = recent14;

    ctl = ctl + (tss - ctl) * (1 - Math.exp(-1 / CTL_TC));
    atl = atl + (tss - atl) * (1 - Math.exp(-1 / ATL_TC));

    points.push({
      date: key,
      daily_tss: Math.round(tss),
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  // Persist past+today (skip future projections from DB)
  const todayKey = today.toISOString().slice(0, 10);
  const dbRows = points
    .filter((p) => p.date <= todayKey)
    .map((p) => ({ ...p, updated_at: new Date().toISOString() }));
  if (dbRows.length) {
    await supabaseAdmin
      .from("training_load")
      .upsert(dbRows, { onConflict: "date" });
  }

  // Peak date prediction: first future date where TSB lands in [+5, +25] window
  let peakDate: string | null = null;
  for (const p of points) {
    if (p.date <= todayKey) continue;
    if (p.tsb >= 5 && p.tsb <= 25) {
      peakDate = p.date;
      break;
    }
  }
  // Taper start = 10 days before race or peak date - 7
  const taperStart = peakDate
    ? new Date(new Date(peakDate).getTime() - 7 * 86400000)
        .toISOString()
        .slice(0, 10)
    : null;

  return { points, peakDate, taperStart };
}

export async function getTrainingLoadSeries(days = 90): Promise<LoadPoint[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("training_load")
    .select("date, daily_tss, ctl, atl, tsb")
    .gte("date", since)
    .order("date", { ascending: true });
  return (
    data?.map((d) => ({
      date: d.date,
      daily_tss: Number(d.daily_tss),
      ctl: Number(d.ctl),
      atl: Number(d.atl),
      tsb: Number(d.tsb),
    })) ?? []
  );
}

export async function getCurrentLoad() {
  const { data } = await supabaseAdmin
    .from("training_load")
    .select("date, ctl, atl, tsb, daily_tss")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
