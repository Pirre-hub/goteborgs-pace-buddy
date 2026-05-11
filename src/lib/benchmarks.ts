// User profile
export const PROFILE = {
  age: 64,
  sex: "male" as const,
  weight_kg: 74,
  height_cm: 180,
};

type Run = {
  distance: number;
  moving_time: number;
  start_date_local: string;
  average_heartrate?: number | null;
};

// Best pace from runs in 3–21 km range, average of top 5 fastest
export function bestRecentPaceSecPerKm(runs: Run[]): {
  pace: number;
  distance_km: number;
  date: string;
  sampleSize: number;
} | null {
  const candidates = runs
    .filter((r) => r.distance >= 3000 && r.distance <= 21500)
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
  return { pace: avgPace, distance_km: avgDist, date: top[0].date, sampleSize: top.length };
}

// WMA 2023 age factors – men, half marathon
const HM_AGE_FACTORS: Record<number, number> = {
  55: 0.8213, 56: 0.8153, 57: 0.8093, 58: 0.8033, 59: 0.7973,
  60: 0.7913, 61: 0.7853, 62: 0.7793, 63: 0.7733, 64: 0.7673,
  65: 0.7613, 66: 0.7553, 67: 0.7493, 68: 0.7433, 69: 0.7373,
};
const HM_WORLD_RECORD_SEC = 3723; // 57:31, Kibel 2024

export function calcAgeGrade(finishTimeSec: number, age: number): {
  percent: number;
  ageGradedTimeSec: number;
  tier: string;
  tone: "excellent" | "good" | "average" | "below";
} {
  const factor = HM_AGE_FACTORS[age] ?? HM_AGE_FACTORS[64];
  const openStd = HM_WORLD_RECORD_SEC / factor;
  const percent = Math.round((openStd / finishTimeSec) * 1000) / 10;
  const ageGradedTimeSec = Math.round(finishTimeSec * factor);
  let tier = "Average/below";
  let tone: "excellent" | "good" | "average" | "below" = "below";
  if (percent >= 90) { tier = "World class"; tone = "excellent"; }
  else if (percent >= 80) { tier = "National class"; tone = "excellent"; }
  else if (percent >= 70) { tier = "Regional class"; tone = "good"; }
  else if (percent >= 60) { tier = "Local class"; tone = "good"; }
  else if (percent >= 50) { tier = "Above average"; tone = "average"; }
  return { percent, ageGradedTimeSec, tier, tone };
}

// Keep these exports so nothing else breaks
export type Bench = {
  value: number; label: string; percentileText: string;
  tone: "excellent" | "good" | "average" | "below"; referenceLabel: string;
};
export function estimateHRmax(age: number) { return Math.round(211 - 0.64 * age); }
export function lowestEasyHR(runs: Run[]): number | null {
  const easy = runs.filter((r) => r.average_heartrate && r.distance >= 4000)
    .map((r) => Number(r.average_heartrate)).sort((a, b) => a - b);
  if (!easy.length) return null;
  const top = easy.slice(0, Math.min(5, easy.length));
  return top.reduce((s, v) => s + v, 0) / top.length;
}
