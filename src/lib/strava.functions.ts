import { createServerFn } from "@tanstack/react-start";
import {
  exchangeCodeForToken,
  fetchRecentRuns,
  isConnected,
  disconnect,
  backfillRecentRuns,
  deepBackfillRuns,
  registerWebhook,
  getSyncState,
  listCachedActivities,
} from "./strava.server";

export const stravaIsConnected = createServerFn({ method: "GET" }).handler(
  async () => {
    return { connected: await isConnected() };
  },
);

export const stravaExchangeCode = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => {
    if (!data?.code || typeof data.code !== "string") {
      throw new Error("Ogiltig kod");
    }
    return { code: data.code };
  })
  .handler(async ({ data }) => {
    return exchangeCodeForToken(data.code);
  });

export const stravaGetRuns = createServerFn({ method: "GET" }).handler(
  async () => {
    const runs = await fetchRecentRuns();
    return { runs };
  },
);

export const stravaDisconnect = createServerFn({ method: "POST" }).handler(
  async () => {
    return disconnect();
  },
);

export const stravaBackfill = createServerFn({ method: "POST" }).handler(
  async () => {
    return backfillRecentRuns();
  },
);

export const stravaDeepBackfill = createServerFn({ method: "POST" })
  .inputValidator((data: { years?: number } | undefined) => ({
    years: Math.min(Math.max(data?.years ?? 3, 1), 10),
  }))
  .handler(async ({ data }) => {
    return deepBackfillRuns(data.years);
  });

export const stravaRegisterWebhook = createServerFn({ method: "POST" })
  .inputValidator((data: { callbackUrl: string }) => {
    if (!data?.callbackUrl) throw new Error("callbackUrl krävs");
    return data;
  })
  .handler(async ({ data }) => {
    const verifyToken = "pirrecoachen-verify-2026";
    return registerWebhook(data.callbackUrl, verifyToken);
  });

export const stravaGetSyncState = createServerFn({ method: "GET" }).handler(
  async () => {
    return { state: await getSyncState() };
  },
);

export const stravaListCached = createServerFn({ method: "GET" }).handler(
  async () => {
    return { activities: await listCachedActivities(30) };
  },
);
