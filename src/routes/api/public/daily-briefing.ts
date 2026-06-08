import { createFileRoute } from "@tanstack/react-router";
import { generateBriefing } from "@/lib/briefing.server";
import { sendPushToAll } from "@/lib/push.server";

export const Route = createFileRoute("/api/public/daily-briefing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.BRIEFING_CRON_SECRET;
        if (!secret) {
          console.error("BRIEFING_CRON_SECRET not configured");
          return new Response("Server not configured", { status: 500 });
        }
        const provided =
          request.headers.get("x-cron-secret") ??
          new URL(request.url).searchParams.get("secret");
        if (provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
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
