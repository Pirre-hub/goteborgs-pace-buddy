import { createServerFn } from "@tanstack/react-start";
import { generatePlan, getCachedPlan } from "./coachplan.server";

export const getCoachPlan = createServerFn({ method: "GET" }).handler(
  async () => {
    return { plan: await getCachedPlan() };
  },
);

export const refreshCoachPlan = createServerFn({ method: "POST" }).handler(
  async () => {
    return { plan: await generatePlan() };
  },
);
