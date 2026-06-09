// Race time prognosis using Riegel's formula + CTL adjustment.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RIEGEL_EXPONENT = 1.06;

type RunRow = {
  start_date_local: string;
  distance: number; // meters
  moving_time: number; // seconds
  sport_type: string | null;
  type: string | null;
};

export type RacePrognosis = {
  hasGoal: boolean;
  goal?: {
    name: string;
    race_date: string;
    distance_km: number;
    goal_pace_sec: number;
    goal_time_sec: number;
    days_to_race: number;
  };
  prognosis_time_sec: number | null;
  prognosis_pace_sec: number | null;
  gap_sec: number | null; // prognosis - goal (positive = behind)
  status: "ahead" | "on_track" | "behind" | "insufficient";
  trend_sec_per_km_4w: number | null; // negative = improving
  based_on_runs: number;
  ref_distance_km: number | null;
  min_time_sec?: number | null;
  max_time_sec?: number | null;
  insufficient_reason?: string;
};

function isRun(r: { sport_type: string | null; type: string | null }) {
  const s = (r.sport_type ?? r.type ?? "").toLowerCase();
  return s.includes("run");
}

function projectFromRuns(
  runs: RunRow[],
  raceDistanceKm: number,
): {
  timeSec: number;
  basedOn: number;
  refDistKm: number;
  minTime: number;
  maxTime: number;
} | null {
  // Sänkt minsta-passlängd till 5 km så fler pass kommer med (Riegel är rimligt
  // träffsäker ned till ~5 km för halvmara).
  const candidates = runs
    .filter(isRun)
    .map((r) => ({
      distKm: Number(r.distance) / 1000,
      sec: Number(r.moving_time),
    }))
    .filter((r) => r.distKm >= 5 && r.sec > 0);

  if (candidates.length === 0) return null;

  // Tier-blend: långpass (≥10 km) väger 60 %, korta pass 40 %.
  // Inom varje tier distansviktad average — längre pass dominerar.
  const longs = candidates.filter((c) => c.distKm >= 10);
  const shorts = candidates.filter((c) => c.distKm < 10);

  const weightedProjection = (
    pool: { distKm: number; sec: number }[],
  ): { time: number; weight: number } => {
    if (pool.length === 0) return { time: 0, weight: 0 };
    let wSum = 0;
    let tSum = 0;
    for (const r of pool) {
      const projected = r.sec * Math.pow(raceDistanceKm / r.distKm, RIEGEL_EXPONENT);
      const w = r.distKm; // distansviktat
      tSum += projected * w;
      wSum += w;
    }
    return { time: tSum / wSum, weight: wSum };
  };

  const longProj = weightedProjection(longs);
  const shortProj = weightedProjection(shorts);

  let timeSec: number;
  if (longProj.weight > 0 && shortProj.weight > 0) {
    timeSec = longProj.time * 0.6 + shortProj.time * 0.4;
  } else if (longProj.weight > 0) {
    timeSec = longProj.time;
  } else {
    timeSec = shortProj.time;
  }

  const allProjections = candidates.map(
    (r) => r.sec * Math.pow(raceDistanceKm / r.distKm, RIEGEL_EXPONENT),
  );
  const minTime = Math.min(...allProjections);
  const maxTime = Math.max(...allProjections);
  const refDistKm =
    candidates.reduce((s, r) => s + r.distKm, 0) / candidates.length;

  return {
    timeSec,
    basedOn: candidates.length,
    refDistKm,
    minTime,
    maxTime,
  };
}

async function fetchCtl(date: Date): Promise<number | null> {
  const key = date.toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("training_load")
    .select("ctl")
    .lte("date", key)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.ctl != null ? Number(data.ctl) : null;
}

export async function getRacePrognosis(): Promise<RacePrognosis> {
  const { data: goal } = await supabaseAdmin
    .from("race_goal")
    .select("name, race_date, distance_km, goal_pace_sec")
    .eq("is_active", true)
    .maybeSingle();

  if (!goal) {
    return {
      hasGoal: false,
      prognosis_time_sec: null,
      prognosis_pace_sec: null,
      gap_sec: null,
      status: "insufficient",
      trend_sec_per_km_4w: null,
      based_on_runs: 0,
      ref_distance_km: null,
    };
  }

  const distanceKm = Number(goal.distance_km);
  const goalPaceSec = Number(goal.goal_pace_sec);
  const goalTimeSec = Math.round(distanceKm * goalPaceSec);
  const raceDate = new Date(`${goal.race_date}T00:00:00`);
  const daysToRace = Math.max(
    0,
    Math.round((raceDate.getTime() - Date.now()) / 86400000),
  );

  const now = new Date();
  // Bredare fönster (42 d) så fler pass kommer med, plus jämförelsefönster 42–84 d
  // för 4-veckors-trend.
  const since42 = new Date(now.getTime() - 42 * 86400000);
  const since84 = new Date(now.getTime() - 84 * 86400000);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);

  const { data: acts } = await supabaseAdmin
    .from("strava_activities")
    .select("start_date_local, distance, moving_time, sport_type, type")
    .gte("start_date_local", since84.toISOString())
    .order("start_date_local", { ascending: false })
    .limit(300);

  const runs: RunRow[] = (acts ?? []).map((a) => ({
    start_date_local: String(a.start_date_local),
    distance: Number(a.distance),
    moving_time: Number(a.moving_time),
    sport_type: (a.sport_type as string | null) ?? null,
    type: (a.type as string | null) ?? null,
  }));

  const recent = runs.filter(
    (r) => new Date(r.start_date_local) >= since42,
  );
  const olderWindow = runs.filter((r) => {
    const d = new Date(r.start_date_local);
    return d < fourWeeksAgo && d >= since84;
  });

  const proj = projectFromRuns(recent, distanceKm);
  if (!proj || proj.basedOn < 1) {
    return {
      hasGoal: true,
      goal: {
        name: goal.name,
        race_date: goal.race_date,
        distance_km: distanceKm,
        goal_pace_sec: goalPaceSec,
        goal_time_sec: goalTimeSec,
        days_to_race: daysToRace,
      },
      prognosis_time_sec: null,
      prognosis_pace_sec: null,
      gap_sec: null,
      status: "insufficient",
      trend_sec_per_km_4w: null,
      based_on_runs: 0,
      ref_distance_km: null,
      insufficient_reason:
        "Behöver minst ett löppass på ≥ 5 km senaste 6 veckorna för prognos.",
    };
  }

  // CTL trend adjustment: up to ±2 % depending on fitness change last 28 days
  const ctlNow = await fetchCtl(now);
  const ctl28 = await fetchCtl(fourWeeksAgo);
  let adjustedTime = proj.timeSec;
  if (ctlNow != null && ctl28 != null && ctl28 > 0) {
    const ctlDelta = (ctlNow - ctl28) / ctl28;
    const adj = Math.max(-0.02, Math.min(0.02, -ctlDelta * 0.5));
    adjustedTime = proj.timeSec * (1 + adj);
  }

  const prognosisPace = adjustedTime / distanceKm;
  const gap = adjustedTime - goalTimeSec;
  const paceGap = prognosisPace - goalPaceSec;

  let status: RacePrognosis["status"];
  if (adjustedTime <= goalTimeSec) status = "ahead";
  else if (paceGap <= 5) status = "on_track";
  else status = "behind";

  let trendSecPerKm: number | null = null;
  const oldProj = projectFromRuns(olderWindow, distanceKm);
  if (oldProj && oldProj.basedOn >= 1) {
    const oldPace = oldProj.timeSec / distanceKm;
    trendSecPerKm = prognosisPace - oldPace;
  }

  return {
    hasGoal: true,
    goal: {
      name: goal.name,
      race_date: goal.race_date,
      distance_km: distanceKm,
      goal_pace_sec: goalPaceSec,
      goal_time_sec: goalTimeSec,
      days_to_race: daysToRace,
    },
    prognosis_time_sec: Math.round(adjustedTime),
    prognosis_pace_sec: Math.round(prognosisPace),
    gap_sec: Math.round(gap),
    status,
    trend_sec_per_km_4w: trendSecPerKm != null ? Math.round(trendSecPerKm) : null,
    based_on_runs: proj.basedOn,
    ref_distance_km: +proj.refDistKm.toFixed(1),
    min_time_sec: Math.round(proj.minTime),
    max_time_sec: Math.round(proj.maxTime),
  };
}
