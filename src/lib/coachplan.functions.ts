import { createServerFn } from "@tanstack/react-start";
import {
  generatePlan,
  getCachedPlan,
  getTrainingLoadData,
} from "./coachplan.server";

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

export const getTrainingLoad = createServerFn({ method: "GET" }).handler(
  async () => {
    return await getTrainingLoadData();
  },
);
