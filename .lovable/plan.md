## Goal

Replace the 4-tile benchmark grid (VDOT, Cooper, VO₂max, HR) with a single age-grading tile based on a projected half marathon finish time at goal pace.

## Changes

### `src/lib/benchmarks.ts`

- Keep: `PROFILE`, `bestRecentPaceSecPerKm` (unchanged exports).
- Add: `HM_AGE_FACTORS` (WMA 2023, men 55–69), `HM_WORLD_RECORD_SEC = 3723`, and `calcAgeGrade(finishTimeSec, age)` returning `{ percent, ageGradedTimeSec, label, tier, tone }` using the tier thresholds 90/80/70/60/50.
- Remove the now-unused exports: `calcVDOT`, `estimateCooper12min`, `lowestEasyHR`, `estimateHRmax`, `estimateVO2maxFromHR`, `vdotBench`, `cooperBench`, `vo2Bench`, `hrBench`, `Bench` type, and the percentile helpers/tables (`VDOT_TABLE_M60`, `COOPER_TABLE_M60`, `VO2_TABLE_M60`, `HR_TABLE_M60`, `percentileText`, `toneFor`, `percentileFromTable`).

### `src/components/BenchmarkCard.tsx`

- Keep card header with Trophy icon and the "Du vs män 64 år …" title.
- Remove the `Tile` subcomponent and 4-tile grid.
- Compute finish time: `370 * 21.1` sec, then call `calcAgeGrade(finishSec, PROFILE.age)`.
- Render:
  - Large percentage number (e.g. `63.4%`).
  - Tier label below (e.g. `Local class`), color-toned.
  - Subtitle: `Ålderskorrigerad halvmaraton, 64 år`.
  - Progress bar 0–100% (use `@/components/ui/progress` already in project, or a simple div bar) with color rules:
    - `< 50%` → gray (muted)
    - `50–60%` → amber
    - `60–70%` → emerald
    - `≥ 70%` → strava orange (`bg-strava`)
  - Below bar: `Motsvarar ~H:MM öppet lopp för en 25-åring` formatted from `ageGradedTimeSec`.
- Drop now-unused imports (`useQuery`, `useServerFn`, `stravaListCached`, removed benchmark helpers). Keep `PROFILE` import. The `runs` prop becomes unused — keep the prop signature to avoid breaking the caller, or remove it if the parent passes nothing critical (will check on implement).

### Technical notes

- Default `Progress` from shadcn uses `bg-primary`; for variable color we'll render a custom bar (`<div class="h-2 w-full rounded-full bg-muted"><div class="h-full rounded-full transition-all" style={{ width, background }} /></div>`) so we can swap color by tier.
- Time formatting: `H:MM` via `Math.floor(sec/3600)` and `Math.floor((sec%3600)/60).padStart(2,'0')`.
