import { createServerFn } from "@tanstack/react-start";
import {
  exchangeCodeForToken,
  fetchRecentRuns,
  isConnected,
  disconnect,
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
