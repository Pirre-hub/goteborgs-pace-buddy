import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCoachPlan, refreshCoachPlan } from "@/lib/coachplan.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  Bed,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ZONE_LABEL: Record<string, { text: string; tone: string; Icon: typeof TrendingUp }> = {
  low: { text: "Undertränad", tone: "text-blue-500", Icon: Bed },
  optimal: { text: "Optimal zon", tone: "text-emerald-500", Icon: TrendingUp },
  high: { text: "Hög belastning", tone: "text-amber-500", Icon: AlertTriangle },
  danger: { text: "Skadezon", tone: "text-red-500", Icon: ShieldAlert },
};

function passIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("vila") || t.includes("rest")) return Bed;
  if (t.includes("interval") || t.includes("tröskel") || t.includes("tempo"))
    return Zap;
  return Activity;
}

export function CoachPlanCard() {
  const qc = useQueryClient();
  const [showMore, setShowMore] = useState(false);

  const getFn = useServerFn(getCoachPlan);
  const refreshFn = useServerFn(refreshCoachPlan);

  const q = useQuery({
    queryKey: ["coach-plan"],
    queryFn: () => getFn(),
    refetchOnWindowFocus: true,
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach-plan"] });
      toast.success("Coach uppdaterad");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const plan = q.data?.plan ?? refreshMut.data?.plan;

  return (
    <Card className="border-strava/30">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-strava" />
          ACWR-coach & 7-dagarsplan
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
        >
          {refreshMut.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" /> Tänker…
            </>
          ) : plan ? (
            "Uppdatera coach"
          ) : (
            "Generera"
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {!plan && !refreshMut.isPending && (
          <p className="text-sm text-muted-foreground">
            ACWR-baserad analys och rullande 7-dagars plan som anpassas efter
            din senaste form. Tryck "Generera" för att starta.
          </p>
        )}

        {plan && (
          <>
            {/* ACWR header */}
            {plan.acwr != null && plan.acwr_zone && (
              <div className="flex items-center gap-3 flex-wrap">
                {(() => {
                  const Z = ZONE_LABEL[plan.acwr_zone];
                  const Icon = Z.Icon;
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${Z.tone}`} />
                        <span className={`font-semibold ${Z.tone}`}>
                          {Z.text}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ACWR{" "}
                        <span className="tabular-nums font-medium text-foreground">
                          {plan.acwr.toFixed(2)}
                        </span>{" "}
                        (akut/kronisk)
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            <p className="text-sm leading-relaxed">{plan.commentary}</p>

            {/* First 7 days as boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {plan.plan.slice(0, 7).map((d) => {
                const Icon = passIcon(d.type);
                return (
                  <div
                    key={d.day_offset}
                    className="rounded-lg border bg-card p-3 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                        {d.weekday}
                        {d.day_offset === 0 && (
                          <span className="text-strava ml-1">• Idag</span>
                        )}
                      </span>
                      <Icon className="h-4 w-4 text-strava" />
                    </div>
                    <div className="font-semibold text-sm">{d.type}</div>
                    <div className="text-sm tabular-nums text-muted-foreground">
                      {d.distance_km != null ? `${d.distance_km} km` : "–"}
                      {d.target_pace ? ` • ${d.target_pace}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {d.purpose}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show more button */}
            {plan.plan.length > 7 && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMore((s) => !s)}
                  className="text-xs"
                >
                  {showMore ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" /> Dölj dag 8–14
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" /> Visa fler 7 dagar
                    </>
                  )}
                </Button>

                {showMore && (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dag</TableHead>
                          <TableHead>Pass</TableHead>
                          <TableHead className="text-right">Distans</TableHead>
                          <TableHead className="text-right">Tempo</TableHead>
                          <TableHead>Syfte</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.plan.slice(7, 14).map((d) => (
                          <TableRow key={d.day_offset}>
                            <TableCell className="font-medium">
                              {d.weekday}
                            </TableCell>
                            <TableCell>{d.type}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {d.distance_km != null
                                ? `${d.distance_km} km`
                                : "–"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {d.target_pace || "–"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {d.purpose}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
