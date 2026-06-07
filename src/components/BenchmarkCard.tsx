import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Footprints, Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stravaListCached } from "@/lib/strava.functions";
import { PROFILE, bestRecentPaceSecPerKm, calcAgeGrade } from "@/lib/benchmarks";

type Run = {
  distance: number;
  moving_time: number;
  start_date_local: string;
  average_heartrate?: number | null;
  sport_type?: string | null;
  trainer?: boolean | null;
  raw?: unknown;
};

const SEGMENTS = [
  { label: "Under 50", bg: "bg-purple-200/60", tier: "Medel" },
  { label: "50–60", bg: "bg-amber-200/60", tier: "Över medel" },
  { label: "60–70", bg: "bg-emerald-200/60", tier: "Bra" },
  { label: "70–80", bg: "bg-lime-200/60", tier: "Stark" },
  { label: "80–90", bg: "bg-sky-200/60", tier: "Mycket hög" },
  { label: "90+", bg: "bg-pink-200/60", tier: "Toppnivå" },
];

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
}

function getNextLevel(percent: number) {
  if (percent < 50) return { label: "Över medel", threshold: 50 };
  if (percent < 60) return { label: "Bra motionsnivå", threshold: 60 };
  if (percent < 70) return { label: "Stark nivå", threshold: 70 };
  if (percent < 80) return { label: "Mycket hög nivå", threshold: 80 };
  if (percent < 90) return { label: "Exceptionellt hög nivå", threshold: 90 };
  return { label: "Exceptionell nivå", threshold: 90 };
}

function getPinLeft(percent: number) {
  const segWidth = 100 / 6;
  let posPct: number;
  if (percent < 50) posPct = (percent / 50) * segWidth;
  else if (percent >= 90) posPct = 5 * segWidth + Math.min((percent - 90) / 10, 1) * segWidth;
  else posPct = segWidth + ((percent - 50) / 10) * segWidth;
  return Math.max(2, Math.min(posPct, 98));
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

  const estimatedFinishSec = best ? Math.round(best.projectedHalfMarathonSec) : null;
  const ag = estimatedFinishSec ? calcAgeGrade(estimatedFinishSec, PROFILE.age) : null;

  const p = ag?.percent ?? 0;
  const atTop = p >= 90;
  const nextLevel = getNextLevel(p);
  const pinLeft = getPinLeft(p);
  const nextSentence = atTop
    ? "En exceptionellt hög åldersgradering baserad på din bästa projektion."
    : `Jämfört med ålderskorrigerad rekordstandard. Nästa nivå: ${nextLevel.label} vid ${nextLevel.threshold}%.`;

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
            Behöver fler löppass i Strava-historiken för att beräkna åldersgradering.
          </p>
        ) : (
            <div className="space-y-5">
              {/* Runner track */}
              <div className="pt-12 pb-1">
                <div className="relative">
                  {/* Pin */}
                  <div
                    className="absolute -top-12 flex flex-col items-center"
                    style={{ left: `${pinLeft}%`, transform: "translateX(-50%)" }}
                  >
                    <div className="max-w-[40vw] truncate rounded-md bg-strava px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap shadow">
                      Pirren · {p.toFixed(1)}%
                    </div>
                    <div className="h-1 w-px bg-strava" />
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-strava text-white shadow">
                      <Footprints className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Segmented bar */}
                  <div className="flex h-7 w-full overflow-hidden rounded-md border">
                    {SEGMENTS.map((s) => (
                      <div
                        key={s.label}
                        className={`flex-1 ${s.bg} flex items-center justify-center text-[10px] font-medium text-foreground/70 border-r last:border-r-0`}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>

                  {/* Tier labels */}
                  <div className="mt-1 flex w-full">
                    {SEGMENTS.map((s) => (
                      <div
                        key={s.tier}
                        className="flex-1 text-center text-[10px] text-muted-foreground"
                      >
                        {s.tier}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main row */}
              <div className="flex items-center gap-4 rounded-lg bg-muted/60 p-4">
                <div className="text-strava font-semibold tabular-nums leading-none" style={{ fontSize: "56px" }}>
                  {p.toFixed(1)}%
                </div>
                <div className="flex-1">
                  <div className="font-bold">{ag.tier}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {nextSentence}
                  </div>
                </div>
              </div>

              {/* Fact row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Öppet lopp (25-åring)
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {formatTime(ag.ageGradedTimeSec)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Din ålderskorrigerade tid
                  </div>
                </div>
                <div className="rounded-lg bg-muted/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Till nästa nivå
                  </div>
                  {atTop ? (
                    <>
                      <div className="mt-1 text-lg font-semibold">Exceptionell nivå</div>
                      <div className="text-[11px] text-muted-foreground">90%+</div>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 text-lg font-semibold tabular-nums">
                        {(nextLevel.threshold - p).toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {nextLevel.label} vid {nextLevel.threshold}%
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
