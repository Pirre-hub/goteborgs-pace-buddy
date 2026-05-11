import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { PROFILE, calcAgeGrade } from "@/lib/benchmarks";

type Run = {
  distance: number;
  moving_time: number;
  start_date_local: string;
  average_heartrate?: number | null;
};

const TONE_TEXT: Record<"excellent" | "good" | "average" | "below", string> = {
  excellent: "text-strava",
  good: "text-emerald-500",
  average: "text-amber-500",
  below: "text-muted-foreground",
};

function barColor(percent: number): string {
  if (percent >= 70) return "bg-strava";
  if (percent >= 60) return "bg-emerald-500";
  if (percent >= 50) return "bg-amber-500";
  return "bg-muted-foreground";
}

function formatHMM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
}

export function BenchmarkCard({ runs: _runs }: { runs: Run[] }) {
  const goalPaceSecPerKm = 370;
  const finishSec = goalPaceSecPerKm * 21.1;
  const grade = calcAgeGrade(finishSec, PROFILE.age);
  const widthPct = Math.max(0, Math.min(100, grade.percent));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-strava" />
          Du vs män {PROFILE.age} år ({PROFILE.weight_kg} kg, {PROFILE.height_cm} cm)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border bg-card p-5 text-center">
          <div className={`text-5xl font-semibold tabular-nums ${TONE_TEXT[grade.tone]}`}>
            {grade.label}
          </div>
          <div className={`mt-1 text-sm font-medium ${TONE_TEXT[grade.tone]}`}>
            {grade.tier}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Ålderskorrigerad halvmaraton, {PROFILE.age} år
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${barColor(grade.percent)}`}
              style={{ width: `${widthPct}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Motsvarar ~{formatHMM(grade.ageGradedTimeSec)} öppet lopp för en 25-åring
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
