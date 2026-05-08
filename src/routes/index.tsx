import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  stravaIsConnected,
  stravaGetRuns,
  stravaExchangeCode,
  stravaDisconnect,
} from "@/lib/strava.functions";
import { getTrainingAdvice } from "@/lib/coach.functions";
import { getActiveGoal } from "@/lib/goal.functions";
import { toast } from "sonner";
import { Sparkles, Loader2, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, parseISO, differenceInDays, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Träningsdashboard" },
      {
        name: "description",
        content:
          "Följ din träning mot ditt mål. Tempo, distans och puls från Strava.",
      },
    ],
  }),
});

const CLIENT_ID = "235302";

type Goal = {
  id: string;
  name: string;
  race_date: string;
  distance_km: number;
  goal_pace_sec: number;
};

type Run = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  average_heartrate?: number;
  average_speed: number;
};

function paceSecPerKm(distanceMeters: number, movingSec: number) {
  if (distanceMeters <= 0) return 0;
  return movingSec / (distanceMeters / 1000);
}

function formatPace(secPerKm: number) {
  if (!secPerKm || !isFinite(secPerKm)) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatFinishTime(goal: { distance_km: number; goal_pace_sec: number }) {
  const totalSec = Math.round(goal.distance_km * goal.goal_pace_sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

function Countdown({ raceDate }: { raceDate: Date }) {
  const days = differenceInDays(raceDate, new Date());
  if (days < 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-2xl font-bold text-strava">Loppet är klart 🎉</span>
        <Link to="/settings">
          <Button size="sm" variant="outline">Sätt nytt mål</Button>
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-5xl font-bold text-strava tabular-nums">{days}</span>
      <span className="text-muted-foreground">dagar till start</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function LoginScreen() {
  const handleLogin = () => {
    const redirect = `${window.location.origin}/auth/callback`;
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("approval_prompt", "auto");
    url.searchParams.set("scope", "activity:read_all");
    window.location.href = url.toString();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Göteborgsvarvet 2026</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Logga in med Strava för att se din träning mot målet 6:10/km
            (sluttid ~2:10:00).
          </p>
          <Button
            onClick={handleLogin}
            className="w-full bg-strava hover:bg-strava/90 text-white"
            size="lg"
          >
            Logga in med Strava
          </Button>
          <p className="text-xs text-muted-foreground">
            Vi läser endast dina aktiviteter (activity:read_all).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Dashboard() {
  const checkConnected = useServerFn(stravaIsConnected);
  const fetchRuns = useServerFn(stravaGetRuns);
  const disconnectFn = useServerFn(stravaDisconnect);
  const adviceFn = useServerFn(getTrainingAdvice);
  const fetchGoal = useServerFn(getActiveGoal);

  const conn = useQuery({
    queryKey: ["strava-connected"],
    queryFn: () => checkConnected(),
  });

  const goalQuery = useQuery({
    queryKey: ["active-goal"],
    queryFn: () => fetchGoal(),
  });
  const goal: Goal | null = goalQuery.data?.goal ?? null;

  const runsQuery = useQuery({
    queryKey: ["strava-runs"],
    queryFn: () => fetchRuns(),
    enabled: !!conn.data?.connected,
    staleTime: 5 * 60 * 1000,
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => window.location.reload(),
  });

  const runs: Run[] = runsQuery.data?.runs ?? [];
  const stats = useMemo(
    () => (runs.length && goal ? computeStats(runs) : null),
    [runs, goal],
  );

  const adviceMut = useMutation({
    mutationFn: () => {
      if (!goal) throw new Error("Inget mål satt");
      const payload = runs.map((r) => ({
        date: r.start_date_local,
        distance_km: +(r.distance / 1000).toFixed(2),
        moving_min: +(r.moving_time / 60).toFixed(1),
        pace_sec_per_km: paceSecPerKm(r.distance, r.moving_time),
        avg_hr: r.average_heartrate,
      }));
      return adviceFn({
        data: {
          runs: payload,
          goal: {
            name: goal.name,
            race_date: goal.race_date,
            distance_km: goal.distance_km,
            goal_pace_sec: goal.goal_pace_sec,
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const advice = adviceMut.data?.advice;



  if (conn.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Laddar…
      </div>
    );
  }

  if (!conn.data?.connected) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {goal?.name ?? "Mitt lopp"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {goal
                ? `Mål: ${goal.distance_km} km på ${formatFinishTime(goal)} (${formatPace(goal.goal_pace_sec)})`
                : "Inget mål satt – gå till inställningar"}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {goal && <Countdown raceDate={parseISO(goal.race_date)} />}
            <Link to="/settings">
              <Button variant="outline" size="sm" aria-label="Inställningar">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMut.mutate()}
            >
              Logga ut
            </Button>
          </div>

        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {runsQuery.isLoading && (
          <div className="text-muted-foreground">Hämtar löppass från Strava…</div>
        )}
        {runsQuery.error && (
          <Card>
            <CardContent className="p-4 text-destructive">
              Kunde inte hämta data: {(runsQuery.error as Error).message}
            </CardContent>
          </Card>
        )}

        {runs.length > 0 && stats && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard
                label="Senaste pass"
                value={formatKm(stats.last.distance)}
                sub={formatPace(stats.last.pace)}
              />
              <StatCard
                label="Längsta pass"
                value={formatKm(stats.longest.distance)}
                sub={format(parseISO(stats.longest.start_date_local), "d MMM", {
                  locale: sv,
                })}
              />
              <StatCard
                label="Snittempo 4 v"
                value={formatPace(stats.avgPace4w)}
              />
              <StatCard
                label="Total distans 4 v"
                value={`${stats.total4w.toFixed(1)} km`}
              />
              <StatCard
                label="Snittpuls 4 v"
                value={stats.avgHr4w ? `${Math.round(stats.avgHr4w)} bpm` : "–"}
              />
            </section>

            <Card className="border-strava/30">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-strava" />
                  AI-coach
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => adviceMut.mutate()}
                  disabled={adviceMut.isPending || runs.length === 0}
                  className="bg-strava hover:bg-strava/90 text-white"
                >
                  {adviceMut.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Tänker…
                    </>
                  ) : advice ? (
                    "Generera nytt råd"
                  ) : (
                    "Hämta träningsråd"
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                {!advice && !adviceMut.isPending && (
                  <p className="text-sm text-muted-foreground">
                    Få personliga råd om nästa pass och en plan för veckan
                    baserat på din senaste träning.
                  </p>
                )}
                {advice && (
                  <div className="space-y-5">
                    <p className="text-sm text-muted-foreground italic">
                      {advice.summary}
                    </p>

                    <div className="rounded-lg border border-strava/40 bg-strava/5 p-4">
                      <div className="text-xs uppercase tracking-wide text-strava font-semibold mb-2">
                        Nästa pass
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
                        <div className="text-lg font-semibold">
                          {advice.next_session.type}
                        </div>
                        <div className="text-sm tabular-nums">
                          {advice.next_session.distance_km} km
                        </div>
                        <div className="text-sm tabular-nums text-muted-foreground">
                          {advice.next_session.target_pace}
                        </div>
                      </div>
                      <p className="text-sm">{advice.next_session.purpose}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        <span className="font-medium">Varför nu:</span>{" "}
                        {advice.next_session.why_now}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                        Veckoplan
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Dag</TableHead>
                              <TableHead>Pass</TableHead>
                              <TableHead className="text-right">Distans</TableHead>
                              <TableHead className="text-right">Tempo</TableHead>
                              <TableHead>Notering</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {advice.week_plan.map((d, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{d.day}</TableCell>
                                <TableCell>{d.type}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {d.distance_km != null ? `${d.distance_km} km` : "–"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {d.target_pace || "–"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {d.note}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Tempotrend – senaste 30 pass
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      reversed
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatPaceShort(v)}
                      domain={["dataMin - 20", "dataMax + 20"]}
                    />
                    <Tooltip
                      formatter={(v: number) => formatPace(v)}
                      labelFormatter={(l) => `Pass: ${l}`}
                    />
                    <ReferenceLine
                      y={goal!.goal_pace_sec}
                      stroke="#FC4C02"
                      strokeDasharray="4 4"
                      label={{
                        value: `Mål ${formatPaceShort(goal!.goal_pace_sec)}`,
                        position: "right",
                        fill: "#FC4C02",
                        fontSize: 11,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="paceSec"
                      stroke="#FC4C02"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Distans per pass – senaste 30
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}`}
                    />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)} km`} />
                    <Bar dataKey="distanceKm" fill="#FC4C02" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Senaste 10 pass</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Namn</TableHead>
                      <TableHead className="text-right">Distans</TableHead>
                      <TableHead className="text-right">Tempo</TableHead>
                      <TableHead className="text-right">Puls</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.slice(0, 10).map((r) => {
                      const pace = paceSecPerKm(r.distance, r.moving_time);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            {format(parseISO(r.start_date_local), "d MMM", {
                              locale: sv,
                            })}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {r.name}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(r.distance / 1000).toFixed(2)} km
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPace(pace)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.average_heartrate
                              ? Math.round(r.average_heartrate)
                              : "–"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {runs.length === 0 && !runsQuery.isLoading && (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              Inga löppass hittades på din Strava-profil.
            </CardContent>
          </Card>
        )}

        <Card className="border-strava/30 bg-strava/5">
          <CardHeader>
            <CardTitle className="text-base text-strava">
              Lopp-taktik
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              <strong>Spring jämnt.</strong> Sikta på 6:10/km från start – starta
              hellre 5–10 sek långsammare än för snabbt. De första 3 km i
              Slottsskogen är trångt, låt pulsen sätta sig.
            </p>
            <p>
              <strong>Backarna.</strong> Spara energi i Örgrytebacken (km 8–10)
              och Aschebergsgatan (km 18). Håll insatsen jämn, inte tempot.
            </p>
            <p>
              <strong>Vätska.</strong> Drick lite vid varje kontroll, särskilt
              efter km 12. Tänk på salter om det är varmt.
            </p>
            <p>
              <strong>Slutet.</strong> Gå inte all-in förrän du är på Skånegatan
              de sista 800 m. Då har du Ullevi-publiken som drar dig in i mål.
            </p>
          </CardContent>
        </Card>

        <footer className="text-center text-xs text-muted-foreground py-6">
          Data från Strava • Uppdateras var 5:e minut
        </footer>
      </main>
    </div>
  );
}

function formatPaceShort(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function computeStats(runs: Run[]) {
  const now = new Date();
  const fourWeeksAgo = subWeeks(now, 4);

  const last = runs[0];
  const longest = runs.reduce(
    (a, r) => (r.distance > a.distance ? r : a),
    runs[0],
  );

  const recent = runs.filter(
    (r) => parseISO(r.start_date) >= fourWeeksAgo,
  );

  const total4w =
    recent.reduce((sum, r) => sum + r.distance, 0) / 1000;

  const totalSec = recent.reduce((s, r) => s + r.moving_time, 0);
  const totalDist = recent.reduce((s, r) => s + r.distance, 0);
  const avgPace4w = totalDist > 0 ? totalSec / (totalDist / 1000) : 0;

  const hrRuns = recent.filter((r) => !!r.average_heartrate);
  const avgHr4w =
    hrRuns.length > 0
      ? hrRuns.reduce((s, r) => s + (r.average_heartrate ?? 0), 0) /
        hrRuns.length
      : 0;

  // Chart: oldest left, newest right
  const ordered = [...runs].reverse();
  const chartData = ordered.map((r) => ({
    dateLabel: format(parseISO(r.start_date_local), "d MMM", { locale: sv }),
    paceSec: paceSecPerKm(r.distance, r.moving_time),
    distanceKm: +(r.distance / 1000).toFixed(2),
  }));

  return {
    last: {
      distance: last.distance,
      pace: paceSecPerKm(last.distance, last.moving_time),
    },
    longest,
    avgPace4w,
    total4w,
    avgHr4w,
    chartData,
  };
}
