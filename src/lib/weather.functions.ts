import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getWeatherForCoords } from "./weather.server";

export const getWeather = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    return getWeatherForCoords(data.lat, data.lon);
  });
