DROP POLICY IF EXISTS "Allow all access to weekly_plans for authenticated users" ON public.weekly_plans;
DROP POLICY IF EXISTS "Allow all access to daily_adjustments for authenticated users" ON public.daily_adjustments;

REVOKE ALL ON public.weekly_plans FROM authenticated, anon;
REVOKE ALL ON public.daily_adjustments FROM authenticated, anon;