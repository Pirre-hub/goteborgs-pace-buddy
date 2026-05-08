import { createServerFn } from "@tanstack/react-start";
import {
  recomputeTrainingLoad,
  getTrainingLoadSeries,
  getCurrentLoad,
} from "./training.server";
import { getActive } from "./goal.server";

export const recomputeLoad = createServerFn({ method: "POST" }).handler(
  async () => {
    const goal = await getActive();
    const goalPace = goal?.goal_pace_sec ?? 360;
    return recomputeTrainingLoad(goalPace);
  },
);

export const getTrainingLoad = createServerFn({ method: "GET" }).handler(
  async () => {
    const goal = await getActive();
    const goalPace = goal?.goal_pace_sec ?? 360;
    // Recompute on read so future projection uses current data
    const { peakDate, taperStart } = await recomputeTrainingLoad(goalPace);
    const series = await getTrainingLoadSeries(90);
    const current = await getCurrentLoad();

    // Build full series including future projection from recompute
    const fullProjection = await recomputeTrainingLoad(goalPace);

    return {
      series,
      projection: fullProjection.points,
      current,
      peakDate,
      taperStart,
      raceDate: goal?.race_date ?? null,
    };
  },
);
