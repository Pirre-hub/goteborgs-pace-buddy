import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTodayChoice, saveChoice } from "@/lib/dailychoice.functions";

type ChoiceType = "running" | "strength" | "walking" | "rest";

const CHOICE_OPTIONS: { type: ChoiceType; label: string; icon: string; color: string }[] = [
  { type: "running", label: "Löpning", icon: "🏃", color: "#FC4C02" },
  { type: "strength", label: "Styrka", icon: "💪", color: "#6366f1" },
  { type: "walking", label: "Gång", icon: "🚶", color: "#10b981" },
  { type: "rest", label: "Vila", icon: "🛏", color: "#9ca3af" },
];

const SUGGESTIONS: Record<ChoiceType, { title: string; details: string[] }> = {
  running: {
    title: "Förslag: Lugnt distanspass",
    details: ["5–7 km", "Tempo 6:30–7:00/km", "Puls < 145"],
  },
  strength: {
    title: "Förslag: Gympass 45 min (löparstyrka)",
    details: [
      "Uppvärmning: 5 min rodd/cykel + dynamisk rörlighet",
      "Knäböj 3×8 (måttlig vikt)",
      "Marklyft 3×6 eller rumänska marklyft 3×8",
      "Utfall 3×10/sida",
      "Höftlyft 3×12",
      "Vadpress 3×15",
      "Plankan 3×45 sek + sidoplanka 3×30 sek/sida",
    ],
  },
  walking: {
    title: "Förslag: Rask promenad",
    details: ["30–45 min", "Lätt andning, kunna prata", "Återhämtning + rörlighet"],
  },
  rest: {
    title: "Förslag: Aktiv vila",
    details: ["10 min mobility/stretch", "Fokus: höfter, vader, rygg", "Sov 7–8 h"],
  },
};

function WorkoutSuggestion({ type }: { type: ChoiceType }) {
  const s = SUGGESTIONS[type];
  if (!s) return null;
  return (
    <div className="mt-2 rounded-md border bg-background p-2 space-y-1">
      <div className="text-xs font-semibold">{s.title}</div>
      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
        {s.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

function optionFor(type: string | null | undefined) {
  return CHOICE_OPTIONS.find((o) => o.type === type);
}

export function DailyChoiceCard({
  recommendedType,
  onChoiceSaved,
}: {
  recommendedType: ChoiceType;
  onChoiceSaved?: () => void;
}) {
  const getFn = useServerFn(getTodayChoice);
  const saveFn = useServerFn(saveChoice);
  const qc = useQueryClient();

  const todayQ = useQuery({
    queryKey: ["today-choice"],
    queryFn: () => getFn(),
  });

  const mut = useMutation({
    mutationFn: (choice: ChoiceType) =>
      saveFn({
        data: {
          date: todayQ.data?.date ?? "",
          recommended_type: recommendedType,
          actual_choice: choice,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today-choice"] });
      onChoiceSaved?.();
    },
  });

  const saved = todayQ.data?.choice;
  const recOpt = optionFor(recommendedType);

  if (saved?.actual_choice) {
    const chosen = optionFor(saved.actual_choice);
    const differs = saved.actual_choice !== saved.recommended_type;
    return (
      <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          Dagens val
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>✓</span>
            <span>{chosen?.icon}</span>
            <span>{chosen?.label} valt för idag</span>
          </div>
          <button
            type="button"
            onClick={() =>
              qc.setQueryData(["today-choice"], {
                ...todayQ.data,
                choice: null,
              })
            }
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Ändra
          </button>
        </div>
        {differs && (
          <p className="text-xs text-muted-foreground">
            Du valde {chosen?.label.toLowerCase()} istället för{" "}
            {optionFor(saved.recommended_type)?.label.toLowerCase()}
          </p>
        )}
        {saved.actual_choice && (
          <WorkoutSuggestion type={saved.actual_choice as ChoiceType} />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
        Vad tränar du idag?
      </div>
      {recOpt && (
        <div className="text-xs text-muted-foreground">
          Coachen rekommenderar: {recOpt.icon} {recOpt.label}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {CHOICE_OPTIONS.map((opt) => {
          const isRec = opt.type === recommendedType;
          return (
            <button
              key={opt.type}
              type="button"
              disabled={mut.isPending}
              onClick={() => mut.mutate(opt.type)}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50 ${
                isRec ? "ring-2 ring-strava/60" : ""
              }`}
              style={isRec ? { borderColor: opt.color } : undefined}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
