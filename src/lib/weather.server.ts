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

export async function getWeatherForCoords(
  lat: number,
  lon: number,
): Promise<WeatherNow> {
  const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon.toFixed(2)}/lat/${lat.toFixed(2)}/data.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "pirrecoachen/1.0" },
  });
  if (!res.ok) throw new Error(`SMHI ${res.status}`);
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
