import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTrainingLoad } from "@/lib/training.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { Activity, TrendingUp, Zap } from "lucide-react";

export function TrainingLoadChart() {
  const fn = useServerFn(getTrainingLoad);
  const q = useQuery({
    queryKey: ["training-load"],
    queryFn: () => fn(),
    staleTime: 60 * 1000,
  });

  if (q.isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-muted-foreground">
          Beräknar träningsbelastning…
        </CardContent>
      </Card>
    );
  if (!q.data) return null;

  const { projection, current, peakDate, taperStart, raceDate } = q.data;

  const chartData = projection.map((p) => ({
    date: p.date,
    label: format(parseISO(p.date), "d MMM", { locale: sv }),
    CTL: p.ctl,
    ATL: p.atl,
    TSB: p.tsb,
  }));

  const todayKey = new Date().toISOString().slice(0, 10);

  const formAdjective = current
    ? Number(current.tsb) > 15
      ? "Toppform 🔥"
      : Number(current.tsb) > 5
        ? "Bra form ✨"
        : Number(current.tsb) > -10
          ? "Balanserad"
          : Number(current.tsb) > -20
            ? "Trött 😴"
            : "Mycket trött ⚠️"
    : "–";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-strava" />
          Form & belastning (Banister TSB)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Form (TSB) idag</div>
            <div className="text-2xl font-semibold tabular-nums">
              {current ? Number(current.tsb).toFixed(1) : "–"}
            </div>
            <div className="text-xs mt-1">{formAdjective}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Fitness (CTL)</div>
            <div className="text-2xl font-semibold tabular-nums">
              {current ? Number(current.ctl).toFixed(1) : "–"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              42-dagars rullande
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Trötthet (ATL)</div>
            <div className="text-2xl font-semibold tabular-nums">
              {current ? Number(current.atl).toFixed(1) : "–"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              7-dagars rullande
            </div>
          </div>
        </div>

        {(peakDate || taperStart) && (
          <div className="rounded-lg border border-strava/30 bg-strava/5 p-3 text-sm space-y-1">
            {peakDate && (
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-strava" />
                <span>
                  <span className="font-semibold">Form-peak:</span>{" "}
                  {format(parseISO(peakDate), "d MMMM", { locale: sv })}
                </span>
              </div>
            )}
            {taperStart && (
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-strava" />
                <span>
                  <span className="font-semibold">Starta tapering:</span>{" "}
                  {format(parseISO(taperStart), "d MMMM", { locale: sv })}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={Math.floor(chartData.length / 8)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name: string) => [v.toFixed(1), name]}
                labelFormatter={(l) => `${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                x={format(parseISO(todayKey), "d MMM", { locale: sv })}
                stroke="#666"
                strokeDasharray="2 2"
                label={{ value: "Idag", fontSize: 10, position: "top" }}
              />
              {raceDate && (
                <ReferenceLine
                  x={format(parseISO(raceDate), "d MMM", { locale: sv })}
                  stroke="#FC4C02"
                  strokeWidth={2}
                  label={{ value: "Lopp", fontSize: 10, position: "top", fill: "#FC4C02" }}
                />
              )}
              <ReferenceLine y={0} stroke="#999" />
              <Line
                type="monotone"
                dataKey="CTL"
                stroke="#0891b2"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="ATL"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="TSB"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground">
          TSB &gt; +5 = peak-fönster. Negativ TSB = bygger form. Linjerna efter
          idag är prognos baserad på senaste 14 dagars genomsnittliga belastning.
        </p>
      </CardContent>
    </Card>
  );
}
