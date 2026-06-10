import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveGoal } from "@/lib/goal.functions";
import { stravaGetRuns } from "@/lib/strava.functions";
import { getTrainingLoad } from "@/lib/coachplan.functions";

import { format, parseISO, differenceInDays } from "date-fns";
import { sv } from "date-fns/locale";


function formatPace(secPerKm: number) {
  if (!secPerKm || !isFinite(secPerKm)) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function tsbStatus(tsb: number): { icon: string; label: string } {
  if (tsb > 5) return { icon: "💪", label: "Pigg" };
  if (tsb >= -10) return { icon: "⚖️", label: "Balanserad" };
  return { icon: "😴", label: "Trött" };
}

export function DailyBriefingCard() {
  const goalFn = useServerFn(getActiveGoal);
  const runsFn = useServerFn(stravaGetRuns);
  const loadFn = useServerFn(getTrainingLoad);

  const goalQ = useQuery({ queryKey: ["active-goal"], queryFn: () => goalFn() });
  const runsQ = useQuery({ queryKey: ["strava-runs"], queryFn: () => runsFn() });
  const loadQ = useQuery({ queryKey: ["training-load"], queryFn: () => loadFn() });

  const goal = goalQ.data?.goal;
  const yesterday = runsQ.data?.runs?.[0];
  const tsb = loadQ.data?.tsb ?? 0;
  const daysToGoal = goal
    ? differenceInDays(parseISO(goal.race_date), new Date())
    : null;

  const status = tsbStatus(tsb);
  const today = new Date();



  return (
    <Card className="border-l-4" style={{ borderLeftColor: "#FC4C02" }}>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Dagens briefing</span>
          <span className="text-xs font-normal text-muted-foreground">
            {format(today, "EEEE d MMMM", { locale: sv })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {goal && daysToGoal != null && (
          <div>
            <span className="text-muted-foreground">Till {goal.name}: </span>
            <span className="font-semibold tabular-nums">
              {Math.max(0, daysToGoal)} dagar
            </span>
          </div>
        )}

        {yesterday && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
              Senaste pass
            </div>
            <div className="font-medium">{yesterday.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {(yesterday.distance / 1000).toFixed(2)} km •{" "}
              {formatPace(
                yesterday.distance > 0
                  ? yesterday.moving_time / (yesterday.distance / 1000)
                  : 0,
              )}{" "}
              • {format(parseISO(yesterday.start_date_local), "d MMM", { locale: sv })}
            </div>
          </div>
        )}

        {loadQ.data && (
          <div className="flex items-center gap-2">
            <span className="text-2xl">{status.icon}</span>
            <div>
              <div className="font-medium">{status.label}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                TSB {tsb > 0 ? "+" : ""}
                {tsb.toFixed(1)}
              </div>
            </div>
          </div>
        )}



      </CardContent>
    </Card>
  );
}
