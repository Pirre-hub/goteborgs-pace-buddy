import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRacePrognosis } from "@/lib/prognosis.functions";
import { formatDuration, formatGap, formatPaceSec } from "@/lib/training";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

const STATUS_META: Record<
  string,
  { dot: string; ring: string; text: string; label: string }
> = {
  ahead: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    text: "text-emerald-600",
    label: "🟢 Före schemat",
  },
  on_track: {
    dot: "bg-amber-500",
    ring: "ring-amber-500/30",
    text: "text-amber-600",
    label: "🟡 På väg mot målet",
  },
  behind: {
    dot: "bg-red-500",
    ring: "ring-red-500/30",
    text: "text-red-600",
    label: "🔴 Bakom målet",
  },
  insufficient: {
    dot: "bg-muted-foreground",
    ring: "ring-muted-foreground/30",
    text: "text-muted-foreground",
    label: "Prognos saknas",
  },
};

export function RacePrognosisCard() {
  const fn = useServerFn(fetchRacePrognosis);
  const q = useQuery({
    queryKey: ["race-prognosis"],
    queryFn: () => fn(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Beräknar prognos…
        </CardContent>
      </Card>
    );
  }

  const data = q.data;
  if (!data || !data.hasGoal || !data.goal) return null;

  const meta = STATUS_META[data.status];
  const insufficient = data.status === "insufficient";

  const trend = data.trend_sec_per_km_4w;
  const trendIcon =
    trend == null ? Minus : trend < -1 ? TrendingDown : trend > 1 ? TrendingUp : Minus;
  const TrendIcon = trendIcon;
  const trendTone =
    trend == null
      ? "text-muted-foreground"
      : trend < -1
        ? "text-emerald-600"
        : trend > 1
          ? "text-red-600"
          : "text-muted-foreground";
  const trendText =
    trend == null
      ? "Trend: behöver mer data"
      : trend < 0
        ? `Trend 4 v: ${Math.abs(trend)} sek/km snabbare`
        : trend > 0
          ? `Trend 4 v: ${trend} sek/km långsammare`
          : "Trend 4 v: oförändrad";

  const paceGap =
    data.prognosis_pace_sec != null
      ? data.prognosis_pace_sec - data.goal.goal_pace_sec
      : null;

  return (
    <Card className={`ring-1 ${meta.ring}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">{data.goal.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {data.goal.distance_km} km · {data.goal.days_to_race} dagar kvar
            </div>
          </div>
          <div className={`text-xs font-medium ${meta.text}`}>{meta.label}</div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Mål
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {formatDuration(data.goal.goal_time_sec)}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {formatPaceSec(data.goal.goal_pace_sec)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Prognos
            </div>
            <div className={`text-xl font-semibold tabular-nums ${meta.text}`}>
              {data.prognosis_time_sec != null
                ? formatDuration(data.prognosis_time_sec)
                : "–"}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {data.prognosis_pace_sec != null
                ? formatPaceSec(data.prognosis_pace_sec)
                : "–"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Gap
            </div>
            <div className={`text-xl font-semibold tabular-nums ${meta.text}`}>
              {data.gap_sec != null ? formatGap(data.gap_sec) : "–"}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {paceGap != null
                ? `${paceGap >= 0 ? "+" : "−"}${Math.abs(paceGap)} sek/km`
                : "–"}
            </div>
          </div>
        </div>

        {insufficient ? (
          <p className="text-xs text-muted-foreground">
            {data.insufficient_reason ?? "Behöver fler löppass för en prognos."}
          </p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <TrendIcon className={`h-3.5 w-3.5 ${trendTone}`} />
              <span className={trendTone}>{trendText}</span>
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              Baserat på {data.based_on_runs} pass (snitt {data.ref_distance_km} km)
              {data.min_time_sec != null && data.max_time_sec != null
                ? ` · spridning ${formatDuration(data.min_time_sec)}–${formatDuration(data.max_time_sec)}`
                : ""}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
