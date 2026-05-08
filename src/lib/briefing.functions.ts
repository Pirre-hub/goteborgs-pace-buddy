import { createServerFn } from "@tanstack/react-start";
import { generateBriefing, getTodayBriefing } from "./briefing.server";

export const getBriefing = createServerFn({ method: "GET" }).handler(async () => {
  return { briefing: await getTodayBriefing() };
});

export const refreshBriefing = createServerFn({ method: "POST" }).handler(
  async () => {
    return { briefing: await generateBriefing() };
  },
);
