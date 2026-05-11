// User profile (hard-coded as requested)
export const PROFILE = {
  age: 64,
  sex: "male" as const,
  weight_kg: 74,
  height_cm: 180,
};

type Run = {
  distance: number; // meters
  moving_time: number; // sec
  start_date_local: string;
  average_heartrate?: number | null;
};

// Aggregate best pace from runs in 3-12 km range across ALL history.
// Uses the average of the top 5 fastest runs to avoid relying on a single race.
export function bestRecentPaceSecPerKm(runs: Run[]): {
  pace: number;
  distance_km: number;
  date: string;
  sampleSize: number;
} | null {
  const candidates = runs
    .filter((r) => r.distance >= 3000 && r.distance <= 12000)
    .map((r) => ({
      pace: r.moving_time / (r.distance / 1000),
      distance_km: r.distance / 1000,
      date: r.start_date_local,
    }))
    .sort((a, b) => a.pace - b.pace);
  if (!candidates.length) return null;
  const top = candidates.slice(0, Math.min(5, candidates.length));
  const avgPace = top.reduce((s, r) => s + r.pace, 0) / top.length;
  const avgDist = top.reduce((s, r) => s + r.distance_km, 0) / top.length;
  return {
    pace: avgPace,
    distance_km: avgDist,
    date: top[0].date,
    sampleSize: top.length,
  };
}

// Age-grading constants for half marathon, men
// World record half marathon men: 3723 sec (57:31, Kibel 2024)
// Age factors from WMA 2023 tables (men, half marathon)
const HM_AGE_FACTORS: Record<number, number> = {
  55: 0.8213, 56: 0.8153, 57: 0.8093, 58: 0.8033, 59: 0.7973,
  60: 0.7913, 61: 0.7853, 62: 0.7793, 63: 0.7733, 64: 0.7673,
  65: 0.7613, 66: 0.7553, 67: 0.7493, 68: 0.7433, 69: 0.7373,
};

const HM_WORLD_RECORD_SEC = 3723;

export function calcAgeGrade(finishTimeSec: number, age: number): {
  percent: number;
  ageGradedTimeSec: number;
  label: string;
  tier: string;
  tone: "excellent" | "good" | "average" | "below";
} {
  const factor = HM_AGE_FACTORS[age] ?? HM_AGE_FACTORS[64];
  const openStd = HM_WORLD_RECORD_SEC / factor;
  const percent = Math.round((openStd / finishTimeSec) * 100 * 10) / 10;
  const ageGradedTimeSec = Math.round(finishTimeSec * factor);
  let tier = "";
  let tone: "excellent" | "good" | "average" | "below" = "below";
  if (percent >= 90) { tier = "World class"; tone = "excellent"; }
  else if (percent >= 80) { tier = "National class"; tone = "excellent"; }
  else if (percent >= 70) { tier = "Regional class"; tone = "good"; }
  else if (percent >= 60) { tier = "Local class"; tone = "good"; }
  else if (percent >= 50) { tier = "Above average"; tone = "average"; }
  else { tier = "Average/below"; tone = "below"; }
  return { percent, ageGradedTimeSec, label: `${percent}%`, tier, tone };
}
