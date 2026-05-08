import { createServerFn } from "@tanstack/react-start";
import { generateAdvice, type RunInput, type GoalContext } from "./coach.server";

export const getTrainingAdvice = createServerFn({ method: "POST" })
  .inputValidator((data: { runs: RunInput[]; goal: GoalContext }) => {
    if (!data || !Array.isArray(data.runs)) throw new Error("Ogiltig indata");
    if (!data.goal) throw new Error("Mål saknas");
    return { runs: data.runs.slice(0, 30), goal: data.goal };
  })
  .handler(async ({ data }) => {
    const advice = await generateAdvice(data.runs, data.goal);
    return { advice };
  });
