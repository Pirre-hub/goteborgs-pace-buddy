import { createServerFn } from "@tanstack/react-start";
import { computeDna, getCachedDna } from "./dna.server";

export const getPaceDna = createServerFn({ method: "GET" }).handler(async () => {
  const cached = await getCachedDna();
  return { dna: cached };
});

export const refreshPaceDna = createServerFn({ method: "POST" }).handler(
  async () => {
    return { dna: await computeDna() };
  },
);
