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
  insufficient_reason?: string;
};

function isRun(r: { sport_type: string | null; type: string | null }) {
  const s = (r.sport_type ?? r.type ?? "").toLowerCase();
  return s.includes("run");
}

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

function projectFromRuns(
  runs: RunRow[],
  raceDistanceKm: number,
): { timeSec: number; basedOn: number; refDistKm: number } | null {
  const minRef = Math.max(raceDistanceKm * 0.6, 8); // halvmara → 12.6 km, fallback ≥ 8 km
  const candidates = runs
    .filter(isRun)
    .map((r) => ({
      distKm: Number(r.distance) / 1000,
      sec: Number(r.moving_time),
    }))
    .filter((r) => r.distKm >= minRef && r.sec > 0);

  let pool = candidates;
  if (pool.length === 0) {
    pool = runs
      .filter(isRun)
      .map((r) => ({
        distKm: Number(r.distance) / 1000,
        sec: Number(r.moving_time),
      }))
      .filter((r) => r.distKm >= 8 && r.sec > 0);
  }
  if (pool.length === 0) return null;

  const projections = pool.map((r) =>
    r.sec * Math.pow(raceDistanceKm / r.distKm, RIEGEL_EXPONENT),
  );
  return {
    timeSec: median(projections),
    basedOn: pool.length,
    refDistKm: median(pool.map((p) => p.distKm)),
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
  const since28 = new Date(now.getTime() - 28 * 86400000);
  const since56 = new Date(now.getTime() - 56 * 86400000);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);

  const { data: acts } = await supabaseAdmin
    .from("strava_activities")
    .select("start_date_local, distance, moving_time, sport_type, type")
    .gte("start_date_local", since56.toISOString())
    .order("start_date_local", { ascending: false })
    .limit(200);

  const runs: RunRow[] = (acts ?? []).map((a) => ({
    start_date_local: String(a.start_date_local),
    distance: Number(a.distance),
    moving_time: Number(a.moving_time),
    sport_type: (a.sport_type as string | null) ?? null,
    type: (a.type as string | null) ?? null,
  }));

  const recent = runs.filter(
    (r) => new Date(r.start_date_local) >= since28,
  );
  const olderWindow = runs.filter((r) => {
    const d = new Date(r.start_date_local);
    return d < fourWeeksAgo && d >= since56;
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
        "Behöver minst ett pass på ≥ 8 km senaste 4 veckorna för prognos.",
    };
  }

  // CTL trend adjustment: up to ±2 % depending on fitness change last 28 days
  const ctlNow = await fetchCtl(now);
  const ctl28 = await fetchCtl(fourWeeksAgo);
  let adjustedTime = proj.timeSec;
  if (ctlNow != null && ctl28 != null && ctl28 > 0) {
    const ctlDelta = (ctlNow - ctl28) / ctl28; // fraction
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

  // 4w trend: same calc, but for runs that existed 4 weeks ago
  let trendSecPerKm: number | null = null;
  const oldProj = projectFromRuns(olderWindow, distanceKm);
  if (oldProj && oldProj.basedOn >= 1) {
    const oldPace = oldProj.timeSec / distanceKm;
    trendSecPerKm = prognosisPace - oldPace; // negative = improvement
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
  };
}
