import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getActiveGoal, saveGoal } from "@/lib/goal.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "Inställningar – Mål" }],
  }),
});

function paceSecToMmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function mmssToSec(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  if (sec >= 60) return null;
  return min * 60 + sec;
}

function SettingsPage() {
  const navigate = useNavigate();
  const fetchGoal = useServerFn(getActiveGoal);
  const saveFn = useServerFn(saveGoal);

  const goalQuery = useQuery({
    queryKey: ["active-goal"],
    queryFn: () => fetchGoal(),
  });

  const goal = goalQuery.data?.goal;

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [distance, setDistance] = useState("");
  const [pace, setPace] = useState("");

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setDate(goal.race_date);
      setDistance(String(goal.distance_km));
      setPace(paceSecToMmss(goal.goal_pace_sec));
    }
  }, [goal]);

  const saveMut = useMutation({
    mutationFn: (input: {
      id?: string;
      name: string;
      race_date: string;
      distance_km: number;
      goal_pace_sec: number;
    }) => saveFn({ data: input }),
    onSuccess: () => {
      toast.success("Mål sparat");
      navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dist = parseFloat(distance.replace(",", "."));
    if (!name.trim()) return toast.error("Ange ett loppnamn");
    if (!date) return toast.error("Ange ett datum");
    if (!isFinite(dist) || dist <= 0) return toast.error("Ogiltig distans");
    const paceSec = mmssToSec(pace);
    if (paceSec === null) return toast.error("Måltempo måste vara på formatet mm:ss");
    saveMut.mutate({
      id: goal?.id,
      name: name.trim(),
      race_date: date,
      distance_km: dist,
      goal_pace_sec: paceSec,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Inställningar</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Mitt mål</CardTitle>
          </CardHeader>
          <CardContent>
            {goalQuery.isLoading ? (
              <div className="text-muted-foreground">Laddar…</div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Loppnamn</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="t.ex. Stockholm Marathon 2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="distance">Distans (km)</Label>
                    <Input
                      id="distance"
                      inputMode="decimal"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      placeholder="21.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pace">Måltempo (mm:ss/km)</Label>
                    <Input
                      id="pace"
                      value={pace}
                      onChange={(e) => setPace(e.target.value)}
                      placeholder="6:10"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="w-full bg-strava hover:bg-strava/90 text-white"
                >
                  {saveMut.isPending ? "Sparar…" : "Spara mål"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
