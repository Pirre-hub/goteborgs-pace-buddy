CREATE TABLE public.race_goal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  race_date date NOT NULL,
  distance_km numeric NOT NULL,
  goal_pace_sec integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX race_goal_one_active ON public.race_goal (is_active) WHERE is_active = true;

ALTER TABLE public.race_goal ENABLE ROW LEVEL SECURITY;

INSERT INTO public.race_goal (name, race_date, distance_km, goal_pace_sec, is_active)
VALUES ('Göteborgsvarvet 2026', '2026-05-23', 21.1, 370, true);