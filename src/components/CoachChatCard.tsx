import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { getTodayConversation, sendMessage, clearTodayConversation } from "@/lib/coachchat.functions";
import { toast } from "sonner";

type PlanContext = {
  todayPlan: string;
  acwr: number | null;
  tsb: number | null;
  lastRun: string;
  daysToRace: number;
  recentDeviations: string;
};

type Msg = { role: "user" | "coach"; content: string };

const QUICK_CHOICES: { emoji: string; label: string; text: string }[] = [
  { emoji: "🏃", label: "Kör löpning", text: "Jag kör löpning idag" },
  { emoji: "💪", label: "Kör styrka", text: "Jag kör styrka idag" },
  { emoji: "🚶", label: "Tar en promenad", text: "Jag tar en promenad idag" },
  { emoji: "🛏", label: "Vilar idag", text: "Jag vilar idag" },
];

export function CoachChatCard({ planContext }: { planContext: PlanContext }) {
  const qc = useQueryClient();
  const fetchConv = useServerFn(getTodayConversation);
  const sendFn = useServerFn(sendMessage);
  const clearFn = useServerFn(clearTodayConversation);
  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const convQ = useQuery({
    queryKey: ["coach-chat-today"],
    queryFn: () => fetchConv(),
  });

  const mut = useMutation({
    mutationFn: (message: string) =>
      sendFn({ data: { message, planContext } }),
    onSuccess: (res) => {
      setPendingUser(null);
      qc.invalidateQueries({ queryKey: ["coach-chat-today"] });
      qc.invalidateQueries({ queryKey: ["recent-choices"] });
      if (res.triggersReplan) {
        toast.info("Coachen uppdaterar schemat…");
        qc.invalidateQueries({ queryKey: ["coach-plan"] });
      }
    },

    onError: (e: unknown) => {
      setPendingUser(null);
      toast.error(
        "Kunde inte nå coachen: " + (e instanceof Error ? e.message : "fel"),
      );
    },
  });

  const messages: Msg[] = (convQ.data?.messages ?? []) as Msg[];
  const showQuick = messages.length === 0 && !pendingUser;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pendingUser, mut.isPending]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || mut.isPending) return;
    setPendingUser(t);
    setInput("");
    mut.mutate(t);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>💬 Prata med coachen</span>
          <span className="text-xs font-normal text-muted-foreground">
            {format(new Date(), "d MMM", { locale: sv })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showQuick && (
          <div className="flex flex-wrap gap-2">
            {QUICK_CHOICES.map((c) => (
              <button
                key={c.label}
                onClick={() => send(c.text)}
                className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        )}

        {(messages.length > 0 || pendingUser || mut.isPending) && (
          <div
            ref={scrollRef}
            className="max-h-80 overflow-y-auto space-y-2 rounded-lg bg-muted/30 p-3"
          >
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} />
            ))}
            {pendingUser && <ChatBubble role="user" content={pendingUser} />}
            {mut.isPending && (
              <div className="flex items-center gap-1 px-3 py-2 w-fit rounded-2xl bg-background border">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Berätta hur du känner dig eller vad du vill göra…"
            disabled={mut.isPending}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || mut.isPending}
            aria-label="Skicka"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChatBubble({ role, content }: { role: "user" | "coach"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-strava text-white px-3 py-2 text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start gap-2">
      <div className="shrink-0 w-7 h-7 rounded-full bg-background border flex items-center justify-center text-sm">
        🧑‍🏫
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-background border px-3 py-2 text-sm whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
      style={{ animationDelay: delay }}
    />
  );
}
