-- Strava activities (detailed cache)
CREATE TABLE public.strava_activities (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  distance NUMERIC NOT NULL,
  moving_time INTEGER NOT NULL,
  elapsed_time INTEGER,
  type TEXT,
  sport_type TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  start_date_local TIMESTAMPTZ,
  average_heartrate NUMERIC,
  max_heartrate NUMERIC,
  average_speed NUMERIC,
  total_elevation_gain NUMERIC,
  splits JSONB,
  raw JSONB,
  detail_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_strava_activities_start ON public.strava_activities(start_date DESC);

-- Training load
CREATE TABLE public.training_load (
  date DATE PRIMARY KEY,
  daily_tss NUMERIC NOT NULL DEFAULT 0,
  ctl NUMERIC NOT NULL DEFAULT 0,
  atl NUMERIC NOT NULL DEFAULT 0,
  tsb NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Strava sync state (single row)
CREATE TABLE public.strava_sync (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_event_at TIMESTAMPTZ,
  last_activity_id BIGINT,
  subscription_id BIGINT,
  CONSTRAINT strava_sync_singleton CHECK (id = 1)
);
INSERT INTO public.strava_sync (id) VALUES (1);

-- Pace DNA cache (single row)
CREATE TABLE public.pace_dna (
  id INTEGER PRIMARY KEY DEFAULT 1,
  insights JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pace_dna_singleton CHECK (id = 1)
);

-- Daily briefings
CREATE TABLE public.briefings (
  date DATE PRIMARY KEY,
  content TEXT NOT NULL,
  workout JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Web push subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS deny-by-default on all (single-user app uses service role only)
ALTER TABLE public.strava_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_load ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pace_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Realtime for strava_sync (so frontend can react to new activities)
ALTER PUBLICATION supabase_realtime ADD TABLE public.strava_sync;
ALTER TABLE public.strava_sync REPLICA IDENTITY FULL;