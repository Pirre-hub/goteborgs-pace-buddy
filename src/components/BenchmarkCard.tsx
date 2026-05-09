import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { stravaListCached } from "@/lib/strava.functions";
import {
  PROFILE,
  bestRecentPaceSecPerKm,
  calcVDOT,
  estimateCooper12min,
  estimateHRmax,
  estimateVO2maxFromHR,
  lowestEasyHR,
  vdotBench,
  cooperBench,
  vo2Bench,
  hrBench,
  type Bench,
} from "@/lib/benchmarks";

type Run = {
  distance: number;
  moving_time: number;
  start_date_local: string;
  average_heartrate?: number | null;
};

const TONE_CLASS: Record<Bench["tone"], string> = {
  excellent: "text-emerald-500",
  good: "text-emerald-500",
  average: "text-amber-500",
  below: "text-muted-foreground",
};

function Tile({
  label,
  bench,
  hint,
}: {
  label: string;
  bench: Bench | null;
  hint?: string;
}) {
  if (!bench)
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-base text-muted-foreground">
          Behöver mer data
        </div>
      </div>
    );
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {bench.label}
      </div>
      <div className={`text-xs font-medium mt-1 ${TONE_CLASS[bench.tone]}`}>
        {bench.percentileText}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        Referens: {bench.referenceLabel}
      </div>
      {hint && (
        <div className="text-xs text-muted-foreground mt-1">{hint}</div>
      )}
    </div>
  );
}

export function BenchmarkCard({ runs: _fallback }: { runs: Run[] }) {
  const listFn = useServerFn(stravaListCached);
  const allQuery = useQuery({
    queryKey: ["strava-cached-all"],
    queryFn: () => listFn({ data: { limit: 5000 } }),
    staleTime: 5 * 60 * 1000,
  });
  const runs: Run[] = (allQuery.data?.activities as Run[] | undefined) ?? _fallback;

  const best = bestRecentPaceSecPerKm(runs);
  const vdot = best
    ? calcVDOT(best.distance_km, best.distance_km * best.pace)
    : null;
  const cooper = best ? estimateCooper12min(best.pace) : null;
  const hrmin = lowestEasyHR(runs);
  const hrmax = estimateHRmax(PROFILE.age);
  const vo2 = hrmin ? estimateVO2maxFromHR(hrmax, hrmin) : null;
  const sample = runs.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-strava" />
          Du vs män {PROFILE.age} år ({PROFILE.weight_kg} kg, {PROFILE.height_cm} cm)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground mb-3">
          Baserat på {sample} pass i din Strava-historik
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="VDOT"
            bench={vdot != null ? vdotBench(vdot) : null}
            hint={best ? `snitt av ${best.sampleSize} bästa pass (~${best.distance_km.toFixed(1)} km)` : undefined}
          />
          <Tile
            label="Cooper 12 min"
            bench={cooper != null ? cooperBench(cooper) : null}
            hint="estimerat från bästa tempo"
          />
          <Tile
            label="VO₂max-skattning"
            bench={vo2 != null ? vo2Bench(vo2) : null}
            hint={hrmin ? `HR-vila ~${Math.round(hrmin)} bpm` : undefined}
          />
          <Tile
            label="Lägsta puls (lugnt)"
            bench={hrmin != null ? hrBench(hrmin) : null}
            hint={`HR-max est. ${hrmax} bpm`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
