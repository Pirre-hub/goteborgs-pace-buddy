Filter out treadmill and virtual runs from the age grading benchmark, so only outdoor runs count.

## Change

In `src/lib/benchmarks.ts`, extend the `Run` type and `bestRecentPaceSecPerKm` to exclude treadmill/virtual runs:

- Add optional fields `trainer?: boolean` and `sport_type?: string` to the `Run` type.
- In the filter, exclude any run where `trainer === true` or `sport_type === "VirtualRun"`.

In `src/components/BenchmarkCard.tsx`, include `trainer` and `sport_type` in the `Run` type so the data flows through (Strava already stores these in `strava_activities.raw` and `sport_type`).

## Notes

- `strava_activities.sport_type` already distinguishes `VirtualRun` from `Run`.
- The `trainer` flag (treadmill indicator from Strava) lives in the `raw` JSON. We'll read it via `(raw as any)?.trainer` when mapping in the card, or alternatively rely solely on `sport_type !== "VirtualRun"` if `trainer` isn't reliably surfaced.
- No database migration needed.
