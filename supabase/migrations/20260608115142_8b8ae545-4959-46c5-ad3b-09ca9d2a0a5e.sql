CREATE TABLE IF NOT EXISTS public.weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  strategy text NOT NULL,
  commentary text NOT NULL,
  days jsonb NOT NULL,
  acwr_at_generation numeric,
  tsb_at_generation numeric,
  generated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_plans TO authenticated;
GRANT ALL ON public.weekly_plans TO service_role;

ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to weekly_plans for authenticated users"
ON public.weekly_plans
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.daily_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  reason text NOT NULL,
  changed_days jsonb NOT NULL,
  triggered_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_adjustments TO authenticated;
GRANT ALL ON public.daily_adjustments TO service_role;

ALTER TABLE public.daily_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to daily_adjustments for authenticated users"
ON public.daily_adjustments
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_weekly_plans_updated_at
BEFORE UPDATE ON public.weekly_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_adjustments_updated_at
BEFORE UPDATE ON public.daily_adjustments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();