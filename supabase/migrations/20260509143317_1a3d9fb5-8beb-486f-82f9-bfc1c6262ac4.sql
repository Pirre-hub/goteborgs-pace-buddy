CREATE TABLE public.coach_plan (
  id integer PRIMARY KEY DEFAULT 1,
  commentary text NOT NULL,
  acwr numeric,
  acwr_zone text,
  plan jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_plan_singleton CHECK (id = 1)
);
ALTER TABLE public.coach_plan ENABLE ROW LEVEL SECURITY;