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

export type StravaActivityDetail = StravaActivity & {
  splits_metric?: Array<{
    distance: number;
    elapsed_time: number;
    moving_time: number;
    average_speed: number;
    average_heartrate?: number;
    elevation_difference?: number;
    split: number;
  }>;
  total_elevation_gain?: number;
};

export async function fetchActivityDetail(
  id: number,
): Promise<StravaActivityDetail | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/activities/${id}?include_all_efforts=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava detail-fel [${res.status}]: ${text}`);
  }
  return (await res.json()) as StravaActivityDetail;
}

export async function syncActivity(id: number) {
  const detail = await fetchActivityDetail(id);
  if (!detail) return null;
  if (detail.type !== "Run" && detail.sport_type !== "Run") return null;

  await supabaseAdmin.from("strava_activities").upsert({
    id: detail.id,
    name: detail.name,
    distance: detail.distance,
    moving_time: detail.moving_time,
    elapsed_time: detail.elapsed_time,
    type: detail.type,
    sport_type: detail.sport_type,
    start_date: detail.start_date,
    start_date_local: detail.start_date_local,
    average_heartrate: detail.average_heartrate ?? null,
    max_heartrate: detail.max_heartrate ?? null,
    average_speed: detail.average_speed,
    total_elevation_gain: detail.total_elevation_gain ?? null,
    splits: (detail.splits_metric ?? null) as never,
    raw: detail as never,
    detail_fetched_at: new Date().toISOString(),
  });

  await supabaseAdmin
    .from("strava_sync")
    .update({
      last_event_at: new Date().toISOString(),
      last_activity_id: detail.id,
    })
    .eq("id", 1);

  return detail;
}

async function fetchRunsPage(
  perPage: number,
  page: number,
  before?: number,
): Promise<StravaActivity[]> {
  const token = await getValidAccessToken();
  if (!token) return [];
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  });
  if (before) params.set("before", String(before));
  const res = await fetch(`${API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API-fel [${res.status}]: ${text}`);
  }
  const all = (await res.json()) as StravaActivity[];
  return all.filter((a) => a.type === "Run" || a.sport_type === "Run");
}

export async function deepBackfillRuns(years = 3): Promise<{
  synced: number;
  skipped: number;
  scanned: number;
  done: boolean;
}> {
  const cutoffSec = Math.floor(Date.now() / 1000) - years * 365 * 86400;
  const MAX_SYNC_PER_CALL = 150; // stay within Worker time limits
  let synced = 0;
  let skipped = 0;
  let scanned = 0;
  let page = 1;
  const perPage = 100;
  let done = true;

  outer: while (true) {
    const runs = await fetchRunsPage(perPage, page);
    if (!runs.length) break;
    scanned += runs.length;

    for (const r of runs) {
      const startSec = Math.floor(new Date(r.start_date).getTime() / 1000);
      if (startSec < cutoffSec) {
        break outer;
      }
      const { data: existing } = await supabaseAdmin
        .from("strava_activities")
        .select("id, detail_fetched_at")
        .eq("id", r.id)
        .maybeSingle();
      if (existing?.detail_fetched_at) {
        skipped++;
        continue;
      }
      try {
        await syncActivity(r.id);
        synced++;
        if (synced >= MAX_SYNC_PER_CALL) {
          done = false;
          break outer;
        }
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        console.error("deep-backfill fail", r.id, e);
      }
    }

    if (runs.length < perPage) break;
    page++;
    if (page > 30) break;
  }
  return { synced, skipped, scanned, done };
}

export async function backfillRecentRuns(): Promise<{
  synced: number;
  skipped: number;
}> {
  const runs = await fetchRecentRuns();
  let synced = 0;
  let skipped = 0;
  for (const r of runs) {
    const { data: existing } = await supabaseAdmin
      .from("strava_activities")
      .select("id, detail_fetched_at")
      .eq("id", r.id)
      .maybeSingle();
    if (existing?.detail_fetched_at) {
      skipped++;
      continue;
    }
    try {
      await syncActivity(r.id);
      synced++;
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      console.error("backfill fail", r.id, e);
    }
  }
  return { synced, skipped };
}

export async function listCachedActivities(limit = 30) {
  const { data, error } = await supabaseAdmin
    .from("strava_activities")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function registerWebhook(callbackUrl: string, verifyToken: string) {
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientSecret) throw new Error("STRAVA_CLIENT_SECRET saknas");

  // Strava only allows 1 push subscription per app — clean up first
  const listRes = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${CLIENT_ID}&client_secret=${clientSecret}`,
  );
  if (listRes.ok) {
    const existing = (await listRes.json()) as Array<{ id: number }>;
    for (const s of existing) {
      await fetch(
        `https://www.strava.com/api/v3/push_subscriptions/${s.id}?client_id=${CLIENT_ID}&client_secret=${clientSecret}`,
        { method: "DELETE" },
      );
    }
  }

  const form = new URLSearchParams();
  form.set("client_id", CLIENT_ID);
  form.set("client_secret", clientSecret);
  form.set("callback_url", callbackUrl);
  form.set("verify_token", verifyToken);

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava webhook reg-fel [${res.status}]: ${text}`);
  }
  const json = (await res.json()) as { id: number };
  await supabaseAdmin
    .from("strava_sync")
    .update({ subscription_id: json.id })
    .eq("id", 1);
  return { subscription_id: json.id };
}

export async function getSyncState() {
  const { data } = await supabaseAdmin
    .from("strava_sync")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return data;
}
