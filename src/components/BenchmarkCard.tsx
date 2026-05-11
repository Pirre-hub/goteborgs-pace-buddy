import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Footprints } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { stravaListCached } from "@/lib/strava.functions";
import { PROFILE, bestRecentPaceSecPerKm, calcAgeGrade } from "@/lib/benchmarks";

type Run = {
  distance: number;
  moving_time: number;
  start_date_local: string;
  average_heartrate?: number | null;
};

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

const TONE_COLORS = {
  excellent: { bar: "#FC4C02", text: "text-strava" },
  good: { bar: "#10b981", text: "text-emerald-500" },
  average: { bar: "#f59e0b", text: "text-amber-500" },
  below: { bar: "#9ca3af", text: "text-muted-foreground" },
};

export function BenchmarkCard({ runs: _fallback }: { runs: Run[] }) {
  const listFn = useServerFn(stravaListCached);
  const allQuery = useQuery({
    queryKey: ["strava-cached-all"],
    queryFn: () => listFn({ data: { limit: 5000 } }),
    staleTime: 5 * 60 * 1000,
  });
  const runs: Run[] =
    (allQuery.data?.activities as Run[] | undefined) ?? _fallback;

  const best = bestRecentPaceSecPerKm(runs);

  // Use actual best pace projected to 21.1 km for age-grading
  const estimatedFinishSec = best ? Math.round(best.pace * 21.1) : null;
  const ag = estimatedFinishSec
    ? calcAgeGrade(estimatedFinishSec, PROFILE.age)
    : null;

  const colors = ag ? TONE_COLORS[ag.tone] : TONE_COLORS.below;
  const widthPct = ag ? Math.max(0, Math.min(100, ag.percent)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-strava" />
          Åldersgradering – män {PROFILE.age} år
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!ag || !best ? (
          <p className="text-sm text-muted-foreground">
            Behöver fler pass i Strava-historiken.
          </p>
        ) : (
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="text-center">
              <div className={`text-5xl font-semibold tabular-nums ${colors.text}`}>
                {ag.percent.toFixed(1)}%
              </div>
              <div className={`mt-1 text-sm font-medium ${colors.text}`}>
                {ag.tier}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Ålderskorrigerad halvmaraton, {PROFILE.age} år
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${widthPct}%`, background: colors.bar }}
              />
            </div>

            <div className="text-xs text-muted-foreground text-center">
              Motsvarar ~{formatTime(ag.ageGradedTimeSec)} öppet lopp för en 25-åring
            </div>

            <div className="text-xs text-muted-foreground text-center">
              Baserat på bästa snitt{" "}
              {`${Math.floor(best.pace / 60)}:${Math.round(best.pace % 60)
                .toString()
                .padStart(2, "0")}`}
              /km ({best.sampleSize} pass, ~{best.distance_km.toFixed(1)} km)
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
