import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getWeather } from "@/lib/weather.functions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Wind,
  Droplets,
  MapPin,
} from "lucide-react";

const FALLBACK = { lat: 57.71, lon: 11.97, label: "Göteborg" }; // default

function symbolIcon(symbol: number | null) {
  if (symbol == null) return Cloud;
  if (symbol === 1 || symbol === 2) return Sun;
  if (symbol === 3 || symbol === 4) return CloudSun;
  if (symbol === 5 || symbol === 6) return Cloud;
  if (symbol === 7) return CloudFog;
  if (symbol === 11 || symbol === 21) return CloudLightning;
  if (symbol >= 15 && symbol <= 17) return CloudSnow;
  if (symbol >= 25 && symbol <= 27) return CloudSnow;
  return CloudRain;
}

export function WeatherStrip() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(FALLBACK);
      setUsingFallback(true);
      return;
    }
    const stored = localStorage.getItem("user-coords");
    const parsed = stored ? (JSON.parse(stored) as { lat: number; lon: number }) : null;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setCoords(c);
        localStorage.setItem("user-coords", JSON.stringify(c));
      },
      () => {
        setCoords(parsed ?? FALLBACK);
        setUsingFallback(!parsed);
      },
      { timeout: 4000, maximumAge: 1000 * 60 * 30 },
    );
  }, []);

  const fn = useServerFn(getWeather);
  const q = useQuery({
    queryKey: ["weather", coords?.lat, coords?.lon],
    queryFn: () => fn({ data: coords! }),
    enabled: !!coords,
    staleTime: 15 * 60 * 1000,
  });

  if (!coords || q.isLoading) {
    return (
      <Card>
        <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
          <MapPin className="h-3 w-3" /> Hämtar väder…
        </CardContent>
      </Card>
    );
  }
  if (q.error || !q.data) return null;

  const w = q.data;
  const Icon = symbolIcon(w.symbol);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon className="h-8 w-8 text-strava" />
            <div>
              <div className="text-2xl font-semibold tabular-nums leading-none">
                {w.temp_c != null ? `${Math.round(w.temp_c)}°` : "–"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {w.description}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Wind className="h-4 w-4 text-muted-foreground" />
            <span className="tabular-nums">
              {w.wind_ms != null ? `${Math.round(w.wind_ms)} m/s` : "–"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Droplets className="h-4 w-4 text-muted-foreground" />
            <span className="tabular-nums">
              {w.precip_mm != null && w.precip_mm > 0
                ? `${w.precip_mm.toFixed(1)} mm/h`
                : "0 mm"}
            </span>
          </div>
          {usingFallback && (
            <div className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Göteborg (standard)
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
