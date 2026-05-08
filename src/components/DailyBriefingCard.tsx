import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBriefing, refreshBriefing } from "@/lib/briefing.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sun, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DailyBriefingCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getBriefing);
  const refreshFn = useServerFn(refreshBriefing);

  const q = useQuery({ queryKey: ["briefing"], queryFn: () => getFn() });
  const refreshMut = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["briefing"] });
      toast.success("Briefing genererad");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const briefing = q.data?.briefing ?? refreshMut.data?.briefing;

  return (
    <Card className="border-strava/30 bg-gradient-to-br from-strava/5 to-transparent">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Sun className="h-4 w-4 text-strava" />
          Dagens briefing
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
        >
          {refreshMut.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" /> Skriver…
            </>
          ) : briefing ? (
            "Uppdatera"
          ) : (
            "Generera"
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!briefing && !refreshMut.isPending && (
          <p className="text-sm text-muted-foreground">
            Kort morgonrapport baserad på din form, väder i Göteborg och senaste
            träning. Skickas automatiskt 06:30.
          </p>
        )}
        {briefing && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{briefing.content}</p>
            {briefing.workout && (
              <div className="rounded-lg border border-strava/40 bg-card p-3">
                <div className="text-xs uppercase tracking-wide text-strava font-semibold mb-1">
                  Dagens pass
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="font-semibold">{briefing.workout.type}</div>
                  {briefing.workout.distance_km != null && (
                    <div className="tabular-nums text-sm">
                      {briefing.workout.distance_km} km
                    </div>
                  )}
                  <div className="tabular-nums text-sm text-muted-foreground">
                    {briefing.workout.target_pace}
                  </div>
                </div>
                <p className="text-sm mt-1">{briefing.workout.focus}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
