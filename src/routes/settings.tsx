import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getActiveGoal, saveGoal } from "@/lib/goal.functions";
import {
  stravaBackfill,
  stravaDeepBackfill,
  stravaRegisterWebhook,
  stravaGetSyncState,
} from "@/lib/strava.functions";
import { getVapidKey, subscribePush } from "@/lib/push.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Bell, CheckCircle2, RefreshCw, Webhook } from "lucide-react";

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

        <AdvancedSection />
      </main>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

function formatSwedishDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActiveBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="secondary"
      className="bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 gap-1"
    >
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function AdvancedSection() {
  const backfillFn = useServerFn(stravaBackfill);
  const deepBackfillFn = useServerFn(stravaDeepBackfill);
  const registerFn = useServerFn(stravaRegisterWebhook);
  const syncStateFn = useServerFn(stravaGetSyncState);
  const vapidFn = useServerFn(getVapidKey);
  const subscribeFn = useServerFn(subscribePush);

  const syncQuery = useQuery({
    queryKey: ["strava-sync-state"],
    queryFn: () => syncStateFn(),
  });

  const [backfillAt, setBackfillAt] = useState<string | null>(null);
  const [deepBackfillAt, setDeepBackfillAt] = useState<string | null>(null);
  const [deepBackfillDone, setDeepBackfillDone] = useState(false);
  const [pushActive, setPushActive] = useState(false);

  useEffect(() => {
    setBackfillAt(localStorage.getItem("strava-backfill-at"));
    setDeepBackfillAt(localStorage.getItem("strava-deep-backfill-at"));
    setDeepBackfillDone(localStorage.getItem("strava-deep-backfill-done") === "1");
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.pushManager.getSubscription().then((sub) => {
          if (sub) setPushActive(true);
        });
      });
    }
  }, []);

  const backfillMut = useMutation({
    mutationFn: () => backfillFn(),
    onSuccess: (r) => {
      const now = new Date().toISOString();
      localStorage.setItem("strava-backfill-at", now);
      setBackfillAt(now);
      toast.success(`Synkat ${r.synced} pass (${r.skipped} fanns redan)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deepBackfillMut = useMutation({
    mutationFn: () => deepBackfillFn({ data: { years: 5 } }),
    onSuccess: (r) => {
      const now = new Date().toISOString();
      localStorage.setItem("strava-deep-backfill-at", now);
      setDeepBackfillAt(now);
      if (r.done) {
        localStorage.setItem("strava-deep-backfill-done", "1");
        setDeepBackfillDone(true);
      }
      toast.success(
        r.done
          ? `Klart! Hämtade ${r.synced} nya pass (${r.skipped} fanns redan)`
          : `Hämtade ${r.synced} nya pass – kör igen för att fortsätta`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const webhookMut = useMutation({
    mutationFn: () =>
      registerFn({
        data: {
          callbackUrl: `${window.location.origin}/api/public/strava-webhook`,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Webhook aktiverad (id ${r.subscription_id})`);
      syncQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pushMut = useMutation({
    mutationFn: async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Push stöds inte i den här webbläsaren");
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifieringar nekades");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await vapidFn();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      return subscribeFn({
        data: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
      });
    },
    onSuccess: () => {
      setPushActive(true);
      toast.success("Notifieringar aktiverade");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const webhookActive = !!syncQuery.data?.state?.subscription_id;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Avancerat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium flex items-center gap-2 flex-wrap">
              Synka detaljerade pass
              {backfillAt && (
                <ActiveBadge label={`Senast: ${formatSwedishDate(backfillAt)}`} />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Hämtar splits, höjd och puls för senaste 30 löppassen.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => backfillMut.mutate()}
            disabled={backfillMut.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {backfillMut.isPending
              ? "Synkar…"
              : backfillAt
                ? "Synka igen"
                : "Backfill"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
          <div>
            <div className="font-medium flex items-center gap-2 flex-wrap">
              Hämta hela historiken
              {deepBackfillDone ? (
                <ActiveBadge label="Klar" />
              ) : deepBackfillAt ? (
                <Badge
                  variant="secondary"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                >
                  Pågår – kör igen
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Hämtar alla löppass från Strava upp till 5 år bakåt. Tar några minuter
              första gången – behövs för långsiktiga jämförelser.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => deepBackfillMut.mutate()}
            disabled={deepBackfillMut.isPending}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {deepBackfillMut.isPending
              ? "Hämtar…"
              : deepBackfillAt && !deepBackfillDone
                ? "Fortsätt"
                : deepBackfillDone
                  ? "Hämta igen"
                  : "Full historik"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
          <div>
            <div className="font-medium flex items-center gap-2 flex-wrap">
              Aktivera live-uppdatering
              {webhookActive && <ActiveBadge label="Aktiverad" />}
            </div>
            <p className="text-sm text-muted-foreground">
              Strava skickar nya pass till appen direkt.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => webhookMut.mutate()}
            disabled={webhookMut.isPending}
          >
            <Webhook className="h-4 w-4 mr-1" />
            {webhookMut.isPending
              ? "Aktiverar…"
              : webhookActive
                ? "Återaktivera"
                : "Aktivera webhook"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
          <div>
            <div className="font-medium flex items-center gap-2 flex-wrap">
              Morgon-notiser
              {pushActive && <ActiveBadge label="Aktiverad" />}
            </div>
            <p className="text-sm text-muted-foreground">
              Få dagens briefing kl 06:30 som push på telefonen.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => pushMut.mutate()}
            disabled={pushMut.isPending}
          >
            <Bell className="h-4 w-4 mr-1" />
            {pushMut.isPending
              ? "Aktiverar…"
              : pushActive
                ? "Återaktivera"
                : "Aktivera"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
