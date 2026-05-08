// Server-only Strava helpers. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CLIENT_ID = "235302";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";

export type StravaActivity = {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed: number; // m/s
};

type TokenRow = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete_id: number | null;
};

export async function exchangeCodeForToken(code: string) {
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!secret) throw new Error("STRAVA_CLIENT_SECRET saknas");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token-utbyte misslyckades [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete?: { id: number };
  };

  await supabaseAdmin.from("strava_tokens").upsert({
    id: 1,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
    athlete_id: json.athlete?.id ?? null,
    updated_at: new Date().toISOString(),
  });

  return { ok: true };
}

async function refreshToken(refresh_token: string): Promise<TokenRow> {
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!secret) throw new Error("STRAVA_CLIENT_SECRET saknas");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava refresh misslyckades [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  const { data: existing } = await supabaseAdmin
    .from("strava_tokens")
    .select("athlete_id")
    .eq("id", 1)
    .maybeSingle();

  await supabaseAdmin.from("strava_tokens").upsert({
    id: 1,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
    athlete_id: existing?.athlete_id ?? null,
    updated_at: new Date().toISOString(),
  });

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
    athlete_id: existing?.athlete_id ?? null,
  };
}

async function getValidAccessToken(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("strava_tokens")
    .select("access_token, refresh_token, expires_at, athlete_id")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(`DB-fel: ${error.message}`);
  if (!data) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (data.expires_at - 60 > nowSec) {
    return data.access_token;
  }
  const refreshed = await refreshToken(data.refresh_token);
  return refreshed.access_token;
}

export async function isConnected(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("strava_tokens")
    .select("id")
    .eq("id", 1)
    .maybeSingle();
  return !!data;
}

export async function disconnect() {
  await supabaseAdmin.from("strava_tokens").delete().eq("id", 1);
  return { ok: true };
}

export async function fetchRecentRuns(): Promise<StravaActivity[]> {
  const token = await getValidAccessToken();
  if (!token) return [];

  // Fetch up to 100 to ensure we get 30 runs after filtering
  const res = await fetch(`${API_BASE}/athlete/activities?per_page=100&page=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API-fel [${res.status}]: ${text}`);
  }

  const all = (await res.json()) as StravaActivity[];
  const runs = all.filter((a) => a.type === "Run" || a.sport_type === "Run");
  return runs.slice(0, 30);
}
