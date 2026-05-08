import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPaceDna, refreshPaceDna } from "@/lib/dna.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dna, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";

export function PaceDNACard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getPaceDna);
  const refreshFn = useServerFn(refreshPaceDna);

  const q = useQuery({ queryKey: ["pace-dna"], queryFn: () => getFn() });
  const refreshMut = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pace-dna"] });
      toast.success("Pace-DNA uppdaterad");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dna = q.data?.dna ?? refreshMut.data?.dna;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Dna className="h-4 w-4 text-strava" />
          Pace-DNA
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
        >
          {refreshMut.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" /> Analyserar…
            </>
          ) : dna ? (
            "Uppdatera"
          ) : (
            "Analysera"
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!dna && !refreshMut.isPending && (
          <p className="text-sm text-muted-foreground">
            AI analyserar dina senaste 30 pass och hittar dina personliga mönster.
          </p>
        )}
        {dna && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              {dna.insights.map((ins, i) => (
                <div key={i} className="rounded-lg border p-3 flex gap-3">
                  <div className="text-2xl shrink-0">{ins.emoji}</div>
                  <div>
                    <div className="font-semibold text-sm">{ins.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {ins.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Beräknad{" "}
              {format(parseISO(dna.computed_at), "d MMM HH:mm", { locale: sv })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
