import { createServerFn } from "@tanstack/react-start";
import { generateAdvice, type RunInput } from "./coach.server";

export const getTrainingAdvice = createServerFn({ method: "POST" })
  .inputValidator((data: { runs: RunInput[] }) => {
    if (!data || !Array.isArray(data.runs)) throw new Error("Ogiltig indata");
    return { runs: data.runs.slice(0, 30) };
  })
  .handler(async ({ data }) => {
    const advice = await generateAdvice(data.runs);
    return { advice };
  });
