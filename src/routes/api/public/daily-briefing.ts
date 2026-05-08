import { createFileRoute } from "@tanstack/react-router";
import { generateBriefing } from "@/lib/briefing.server";
import { sendPushToAll } from "@/lib/push.server";

export const Route = createFileRoute("/api/public/daily-briefing")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const briefing = await generateBriefing();
          const push = await sendPushToAll({
            title: "🏃 Morgonbriefing",
            body: briefing.content.slice(0, 140),
            url: "/",
          });
          return Response.json({ ok: true, briefing, push });
        } catch (e) {
          console.error("daily-briefing fail", e);
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
