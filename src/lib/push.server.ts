// Server-only web push helpers
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const VAPID_PUBLIC_KEY =
  "BMceE1ss5T3em8iRYkE0fXRyrRlz6xlgJ9bHBJwQS2g7AjAwv5JlWKfAp_I2soFh7XvDptsPgvHgHW05IANSTdc";
const VAPID_PRIVATE_KEY = "1GblfHjvlFvUt15ogbOruCrPxsHUoefLbNjYsK5fQao";
const VAPID_SUBJECT = "mailto:coach@pirrecoachen.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function saveSubscription(sub: PushSub) {
  await supabaseAdmin.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  return { ok: true };
}

export async function removeSubscription(endpoint: string) {
  await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
}) {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (!subs?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // Stale subscription – clean up
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", s.endpoint);
        }
        console.error("Push failed:", code, err);
        failed++;
      }
    }),
  );
  return { sent, failed };
}
