import { createFileRoute } from "@tanstack/react-router";
import { syncActivity } from "@/lib/strava.server";
import { recomputeTrainingLoad } from "@/lib/training.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VERIFY_TOKEN = "pirrecoachen-verify-2026";

export const Route = createFileRoute("/api/public/strava-webhook")({
  server: {
    handlers: {
      // Strava verification handshake
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
          return Response.json({ "hub.challenge": challenge });
        }
        return new Response("Forbidden", { status: 403 });
      },
      // Strava event delivery
      POST: async ({ request }) => {
        type Event = {
          object_type: "activity" | "athlete";
          object_id: number;
          aspect_type: "create" | "update" | "delete";
          owner_id: number;
        };
        let event: Event | null = null;
        try {
          event = (await request.json()) as Event;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        if (!event) return new Response("ok");

        if (event.object_type === "activity") {
          if (event.aspect_type === "delete") {
            await supabaseAdmin
              .from("strava_activities")
              .delete()
              .eq("id", event.object_id);
          } else {
            try {
              await syncActivity(event.object_id);
              const { data: goal } = await supabaseAdmin
                .from("race_goal")
                .select("goal_pace_sec")
                .eq("is_active", true)
                .maybeSingle();
              await recomputeTrainingLoad(goal?.goal_pace_sec ?? 360);
            } catch (e) {
              console.error("webhook sync fail", e);
            }
          }
          // Trigger realtime ping
          await supabaseAdmin
            .from("strava_sync")
            .update({
              last_event_at: new Date().toISOString(),
              last_activity_id: event.object_id,
            })
            .eq("id", 1);
        }
        return new Response("ok");
      },
    },
  },
});
