import { createServerFn } from "@tanstack/react-start";
import { getRacePrognosis } from "./prognosis.server";

export const fetchRacePrognosis = createServerFn({ method: "GET" }).handler(
  async () => {
    return await getRacePrognosis();
  },
);
