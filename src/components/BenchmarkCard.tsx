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
            Behöver fler löppass i Strava-historiken för att beräkna åldersgradering.
          </p>
        ) : (() => {
          const segments = [
            { label: "Under 50", bg: "bg-purple-200/60", tier: "Average" },
            { label: "50–60", bg: "bg-amber-200/60", tier: "Above avg" },
            { label: "60–70", bg: "bg-emerald-200/60", tier: "Local" },
            { label: "70–80", bg: "bg-lime-200/60", tier: "Regional" },
            { label: "80–90", bg: "bg-sky-200/60", tier: "National" },
            { label: "90+", bg: "bg-pink-200/60", tier: "World" },
          ];
          const p = ag.percent;
          let nextLabel = "";
          let nextThreshold = 0;
          if (p < 50) { nextLabel = "Above average"; nextThreshold = 50; }
          else if (p < 60) { nextLabel = "Local class"; nextThreshold = 60; }
          else if (p < 70) { nextLabel = "Regional class"; nextThreshold = 70; }
          else if (p < 80) { nextLabel = "National class"; nextThreshold = 80; }
          else if (p < 90) { nextLabel = "World class"; nextThreshold = 90; }
          const atTop = p >= 90;
          const nextSentence = atTop
            ? "Du är i världseliten."
            : `Bättre än de flesta aktiva motionslöpare i din åldersgrupp. Nästa nivå: ${nextLabel} vid ${nextThreshold}%.`;
          // Map percent to bar position: segments are [0–50, 50–60, 60–70, 70–80, 80–90, 90–100]
          // Each segment is 1/6 of bar width regardless of value range.
          const segWidth = 100 / 6;
          let posPct: number;
          if (p < 50) posPct = (p / 50) * segWidth;
          else if (p >= 90) posPct = 5 * segWidth + Math.min((p - 90) / 10, 1) * segWidth;
          else posPct = segWidth + ((p - 50) / 10) * segWidth;
          const pinLeft = Math.max(2, Math.min(posPct, 98));

          return (
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
                    {segments.map((s) => (
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
                    {segments.map((s) => (
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
                      <div className="mt-1 text-lg font-semibold">Världselit uppnådd</div>
                      <div className="text-[11px] text-muted-foreground">90%+</div>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 text-lg font-semibold tabular-nums">
                        {(nextThreshold - p).toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {nextLabel} vid {nextThreshold}%
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
