import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTrainingLoad } from "@/lib/coachplan.functions";
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

function tsbColor(tsb: number) {
  if (tsb > 5) return "text-emerald-600";
  if (tsb >= -10) return "text-amber-600";
  return "text-red-600";
}

function tsbLabel(tsb: number) {
  if (tsb > 5) return "Pigg och formstark";
  if (tsb >= -10) return "Balanserad";
  return "Trött – prioritera vila";
}

function interpretation(tsb: number) {
  if (tsb > 5)
    return "Du är utvilad och redo att prestera – bra timing inför loppet.";
  if (tsb >= 0) return "Bra balans mellan form och trötthet.";
  return "Kroppen är lite trött. Lugna pass prioriteras.";
}

export function TrainingLoadCard() {
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

  const { ctl, atl, tsb, trend } = q.data;
  const last60 = trend.map((p) => ({
    ...p,
    label: format(parseISO(p.date), "d MMM", { locale: sv }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Träningsbelastning (CTL/ATL/TSB)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">CTL (Fitness)</div>
            <div className="text-2xl font-semibold tabular-nums text-blue-600">
              {ctl.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              42-dagars snitt – din grundform
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">ATL (Fatigue)</div>
            <div className="text-2xl font-semibold tabular-nums text-red-600">
              {atl.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              7-dagars snitt – aktuell trötthet
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">TSB (Form)</div>
            <div
              className={`text-2xl font-semibold tabular-nums ${tsbColor(tsb)}`}
            >
              {tsb > 0 ? "+" : ""}
              {tsb.toFixed(1)}
            </div>
            <div className={`text-xs mt-1 ${tsbColor(tsb)}`}>
              {tsbLabel(tsb)}
            </div>
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last60}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={Math.floor(last60.length / 6)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, name: string) => [v.toFixed(1), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#999" />
              <Line
                type="monotone"
                dataKey="ctl"
                name="CTL"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="atl"
                name="ATL"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="tsb"
                name="TSB"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="text-sm text-muted-foreground">{interpretation(tsb)}</p>
      </CardContent>
    </Card>
  );
}
