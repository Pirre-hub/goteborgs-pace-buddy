// SMHI weather for arbitrary lat/lon (Sweden coverage)
export type WeatherNow = {
  temp_c: number | null;
  wind_ms: number | null;
  precip_mm: number | null;
  symbol: number | null; // SMHI Wsymb2 1-27
  description: string;
};

const SYMB: Record<number, string> = {
  1: "Klart",
  2: "Mest klart",
  3: "Växlande moln",
  4: "Halvklart",
  5: "Molnigt",
  6: "Mulet",
  7: "Dimma",
  8: "Lätt regnskur",
  9: "Regnskur",
  10: "Kraftig regnskur",
  11: "Åskskur",
  12: "Lätt by med snöblandat regn",
  13: "By med snöblandat regn",
  14: "Kraftig by med snöblandat regn",
  15: "Lätt snöby",
  16: "Snöby",
  17: "Kraftig snöby",
  18: "Lätt regn",
  19: "Regn",
  20: "Kraftigt regn",
  21: "Åska",
  22: "Lätt snöblandat regn",
  23: "Snöblandat regn",
  24: "Kraftigt snöblandat regn",
  25: "Lätt snöfall",
  26: "Snöfall",
  27: "Kraftigt snöfall",
};

async function getWeatherFromOpenMeteo(
  lat: number,
  lon: number,
): Promise<WeatherNow> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&wind_speed_unit=ms`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      precipitation?: number;
      wind_speed_10m?: number;
      weather_code?: number;
    };
  };
  const c = json.current ?? {};
  const wmo = c.weather_code ?? null;
  const symbol =
    wmo == null ? null
    : wmo === 0 ? 1
    : wmo === 1 ? 2
    : wmo === 2 ? 3
    : wmo === 3 ? 6
    : wmo === 45 || wmo === 48 ? 7
    : wmo >= 51 && wmo <= 67 ? 19
    : wmo >= 71 && wmo <= 77 ? 26
    : wmo >= 80 && wmo <= 82 ? 9
    : wmo >= 95 ? 21
    : 5;
  return {
    temp_c: c.temperature_2m ?? null,
    wind_ms: c.wind_speed_10m ?? null,
    precip_mm: c.precipitation ?? null,
    symbol,
    description: symbol != null ? (SYMB[symbol] ?? "–") : "–",
  };
}

function metNoSymbol(symbolCode: string | undefined): number | null {
  if (!symbolCode) return null;
  const s = symbolCode.toLowerCase();
  if (s.includes("clearsky")) return 1;
  if (s.includes("fair")) return 2;
  if (s.includes("partlycloudy")) return 3;
  if (s.includes("cloudy")) return 5;
  if (s.includes("fog")) return 7;
  if (s.includes("thunder")) return 21;
  if (s.includes("sleet")) return 23;
  if (s.includes("snow")) return 26;
  if (s.includes("rain") || s.includes("showers")) return 19;
  return 5;
}

async function getWeatherFromMetNo(
  lat: number,
  lon: number,
): Promise<WeatherNow> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "pirrecoachen/1.0 contact: lovable-app" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`MET Norway ${res.status}`);
  const json = (await res.json()) as {
    properties?: {
      timeseries?: Array<{
        data?: {
          instant?: { details?: { air_temperature?: number; wind_speed?: number } };
          next_1_hours?: {
            summary?: { symbol_code?: string };
            details?: { precipitation_amount?: number };
          };
        };
      }>;
    };
  };
  const point = json.properties?.timeseries?.[0]?.data;
  if (!point?.instant?.details) throw new Error("Ingen prognosdata");
  const symbol = metNoSymbol(point.next_1_hours?.summary?.symbol_code);
  return {
    temp_c: point.instant.details.air_temperature ?? null,
    wind_ms: point.instant.details.wind_speed ?? null,
    precip_mm: point.next_1_hours?.details?.precipitation_amount ?? null,
    symbol,
    description: symbol != null ? (SYMB[symbol] ?? "–") : "–",
  };
}

export async function getWeatherForCoords(
  lat: number,
  lon: number,
): Promise<WeatherNow> {
  try {
    return await getWeatherFromMetNo(lat, lon);
  } catch {
    // Continue to SMHI/Open-Meteo fallbacks below.
  }

  const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon.toFixed(2)}/lat/${lat.toFixed(2)}/data.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "pirrecoachen/1.0" },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res || !res.ok) {
    // SMHI only covers the Nordics; fall back to Open-Meteo globally
    try {
      return await getWeatherFromOpenMeteo(lat, lon);
    } catch {
      return {
        temp_c: null,
        wind_ms: null,
        precip_mm: null,
        symbol: null,
        description: "Väder tillfälligt otillgängligt",
      };
    }
  }
  const json = (await res.json()) as {
    timeSeries: Array<{
      validTime: string;
      parameters: Array<{ name: string; values: number[] }>;
    }>;
  };
  // Pick the forecast point closest to "now"
  const now = Date.now();
  const closest = json.timeSeries.reduce((best, t) => {
    const diff = Math.abs(new Date(t.validTime).getTime() - now);
    return !best || diff < best.diff ? { t, diff } : best;
  }, null as { t: (typeof json.timeSeries)[number]; diff: number } | null);
  if (!closest) throw new Error("Ingen prognosdata");

  const get = (n: string) =>
    closest.t.parameters.find((p) => p.name === n)?.values[0] ?? null;

  const symbol = get("Wsymb2");
  return {
    temp_c: get("t"),
    wind_ms: get("ws"),
    precip_mm: get("pmean"),
    symbol,
    description: symbol != null ? (SYMB[symbol] ?? "–") : "–",
  };
}
