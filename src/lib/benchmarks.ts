// User profile (hard-coded as requested)
export const PROFILE = {
  age: 64,
  sex: "male" as const,
  weight_kg: 74,
  height_cm: 180,
};

// Best 5K (or near-5K) performance window from recent runs
type Run = {
  distance: number; // meters
  moving_time: number; // sec
  start_date_local: string;
  average_heartrate?: number | null;
};

// Find best pace on a run between 3-10 km, last 90 days
export function bestRecentPaceSecPerKm(runs: Run[]): {
  pace: number;
  distance_km: number;
  date: string;
} | null {
  const since = Date.now() - 90 * 86400000;
  const candidates = runs
    .filter(
      (r) =>
        r.distance >= 3000 &&
        r.distance <= 12000 &&
        new Date(r.start_date_local).getTime() > since,
    )
    .map((r) => ({
      pace: r.moving_time / (r.distance / 1000),
      distance_km: r.distance / 1000,
      date: r.start_date_local,
    }))
    .sort((a, b) => a.pace - b.pace);
  return candidates[0] ?? null;
}

// Jack Daniels VDOT calculation
// VO2 = -4.6 + 0.182258 * v + 0.000104 * v^2  (v in m/min)
// %VO2max = 0.8 + 0.1894393 * exp(-0.012778*t) + 0.2989558 * exp(-0.1932605*t)
export function calcVDOT(distance_km: number, time_sec: number): number {
  const t = time_sec / 60;
  const v = (distance_km * 1000) / t;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pctMax =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * t) +
    0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pctMax;
}

// Cooper-12min: estimate distance covered in 12 min based on best 5K pace
export function estimateCooper12min(paceSecPerKm: number): number {
  // 12 min @ this pace -> meters
  return Math.round((720 / paceSecPerKm) * 1000);
}

// Lowest avg HR from easy/long runs in last 60d (proxy for fitness)
export function lowestEasyHR(runs: Run[]): number | null {
  const since = Date.now() - 60 * 86400000;
  const easy = runs.filter(
    (r) =>
      r.average_heartrate &&
      new Date(r.start_date_local).getTime() > since &&
      r.distance >= 4000,
  );
  if (!easy.length) return null;
  return Math.min(...easy.map((r) => Number(r.average_heartrate)));
}

// VO2max via Uth-Sørensen: VO2max = 15 * (HRmax / HRrest)
// HRmax = 211 - 0.64*age (Nes formula, more accurate for 60+)
export function estimateHRmax(age: number) {
  return Math.round(211 - 0.64 * age);
}

export function estimateVO2maxFromHR(
  hrmax: number,
  hrrest_proxy: number,
): number {
  return 15 * (hrmax / hrrest_proxy);
}

// ============ REFERENCE TABLES (men 60-69) ============
// Sources: ACSM, Jack Daniels VDOT tables, Cooper test norms

// VDOT percentiles for men 60-69 (recreational runners)
// rough mapping based on Daniels' tables + age-grading
export type Bench = {
  value: number;
  label: string; // e.g. "47:32"
  percentileText: string; // "Topp 10 %"
  tone: "excellent" | "good" | "average" | "below";
};

function percentileText(p: number): string {
  if (p >= 90) return `Topp ${100 - p} %`;
  if (p >= 75) return `Topp ${100 - p} %`;
  if (p >= 50) return `Över median`;
  if (p >= 25) return `Under median`;
  return `Lägsta kvartilen`;
}

function toneFor(p: number): Bench["tone"] {
  if (p >= 80) return "excellent";
  if (p >= 60) return "good";
  if (p >= 40) return "average";
  return "below";
}

// Linear interpolation of percentile from ordered breakpoints
function percentileFromTable(
  value: number,
  table: Array<[number, number]>, // [percentile, value]
  higherIsBetter: boolean,
): number {
  const sorted = [...table].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < sorted.length - 1; i++) {
    const [p1, v1] = sorted[i];
    const [p2, v2] = sorted[i + 1];
    const inRange = higherIsBetter
      ? value >= v1 && value <= v2
      : value <= v1 && value >= v2;
    if (inRange) {
      const ratio = (value - v1) / (v2 - v1 || 1);
      return Math.round(p1 + ratio * (p2 - p1));
    }
  }
  // outside table
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (higherIsBetter) {
    return value < first[1] ? 5 : 95;
  }
  return value > first[1] ? 5 : 95;
}

// VDOT for men 60-69 (percentile -> VDOT value)
const VDOT_TABLE_M60: Array<[number, number]> = [
  [10, 25],
  [25, 30],
  [50, 35],
  [75, 42],
  [90, 50],
  [95, 56],
];

// Cooper 12-min distance (m) for men 60+
const COOPER_TABLE_M60: Array<[number, number]> = [
  [10, 1900],
  [25, 2200],
  [50, 2500],
  [75, 2700],
  [90, 3000],
  [95, 3200],
];

// VO2max ml/kg/min for men 60-69 (ACSM)
const VO2_TABLE_M60: Array<[number, number]> = [
  [10, 17],
  [25, 21],
  [50, 25],
  [75, 30],
  [90, 36],
  [95, 41],
];

// Resting/easy HR proxy for trained men 60+ (lower = better)
const HR_TABLE_M60: Array<[number, number]> = [
  [95, 110],
  [75, 125],
  [50, 138],
  [25, 148],
  [10, 158],
];

export function vdotBench(vdot: number): Bench {
  const p = percentileFromTable(vdot, VDOT_TABLE_M60, true);
  return {
    value: vdot,
    label: vdot.toFixed(1),
    percentileText: percentileText(p),
    tone: toneFor(p),
  };
}

export function cooperBench(meters: number): Bench {
  const p = percentileFromTable(meters, COOPER_TABLE_M60, true);
  return {
    value: meters,
    label: `${(meters / 1000).toFixed(2)} km`,
    percentileText: percentileText(p),
    tone: toneFor(p),
  };
}

export function vo2Bench(vo2: number): Bench {
  const p = percentileFromTable(vo2, VO2_TABLE_M60, true);
  return {
    value: vo2,
    label: `${vo2.toFixed(1)} ml/kg/min`,
    percentileText: percentileText(p),
    tone: toneFor(p),
  };
}

export function hrBench(hr: number): Bench {
  const p = percentileFromTable(hr, HR_TABLE_M60, false);
  return {
    value: hr,
    label: `${Math.round(hr)} bpm`,
    percentileText: percentileText(p),
    tone: toneFor(p),
  };
}
