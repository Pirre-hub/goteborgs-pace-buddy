import { createServerFn } from "@tanstack/react-start";
import { getActive, upsertGoal } from "./goal.server";

export const getActiveGoal = createServerFn({ method: "GET" }).handler(
  async () => {
    const goal = await getActive();
    return { goal };
  },
);

export const saveGoal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id?: string;
      name: string;
      race_date: string;
      distance_km: number;
      goal_pace_sec: number;
    }) => {
      if (!data?.name || !data?.race_date) throw new Error("Namn och datum krävs");
      if (!(data.distance_km > 0)) throw new Error("Distans måste vara > 0");
      if (!(data.goal_pace_sec >= 180 && data.goal_pace_sec <= 900))
        throw new Error("Måltempo orimligt (3:00–15:00/km)");
      return data;
    },
  )
  .handler(async ({ data }) => {
    return upsertGoal(data);
  });
