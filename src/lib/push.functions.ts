import { createServerFn } from "@tanstack/react-start";
import {
  saveSubscription,
  removeSubscription,
  VAPID_PUBLIC_KEY,
  type PushSub,
} from "./push.server";

export const getVapidKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: VAPID_PUBLIC_KEY };
});

export const subscribePush = createServerFn({ method: "POST" })
  .inputValidator((data: PushSub) => {
    if (!data?.endpoint || !data?.keys?.p256dh || !data?.keys?.auth) {
      throw new Error("Ofullständig prenumeration");
    }
    return data;
  })
  .handler(async ({ data }) => {
    return saveSubscription(data);
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .inputValidator((data: { endpoint: string }) => {
    if (!data?.endpoint) throw new Error("endpoint krävs");
    return data;
  })
  .handler(async ({ data }) => {
    return removeSubscription(data.endpoint);
  });
