## Why

The reporting date control speaks calendar days. The process owner picks
4 August and expects the instances that started on 4 August. In Switzerland
they get a window that opens at 02:00 on 4 August and closes at 01:59:59 on
5 August.

`packages/web/src/areas/reporting/screens/reportingLogic.ts:33` builds each
bound by appending a `Z` to the picked day:

```ts
new Date(`${value}T${edge === "start" ? "00:00:00.000Z" : "23:59:59.999Z"}`)
```

The `Z` pins the boundary to UTC midnight. Line 28 has the mirror fault:
`toDateInput` reads the day back with `iso.slice(0, 10)`, which takes the UTC
date. An instant at 00:30 on 4 August in Zurich is `2026-08-03T22:30Z`, so the
control redisplays it as 3 August.

Both faults are invisible in UTC and wrong everywhere else. The container runs
UTC, so no test sees them. Lines 39 to 41 of
`packages/web/test/reporting-reportingLogic.test.ts` assert the current UTC
output and pass.

## What Changes

- `fromDateInput` builds local midnight and local end-of-day for the picked
  day, rather than UTC midnight.
- `toDateInput` reads the local calendar day out of an instant, so the value
  the control shows round-trips through `fromDateInput`.
- `defaultRange` keeps its thirty-day window. Its bounds move to the same
  local day edges, so the control opens on a range it redisplays unchanged.
- New tests replace the three that assert the UTC output. They assert the
  round trip, which holds in every timezone, plus one case under a fixed
  non-UTC timezone.
- No server change. `reporting-analytics-api` takes two instants and compares
  them against `instances.startedAt`. Which instants a day means is the
  frontend's question.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reporting-app`: one requirement gains a rule. A picked calendar day means
  that day in the viewer's local time, in both directions. The requirement is
  "Every view shares one date-range filter defaulting to the last thirty
  days".

## Impact

- `packages/web/src/areas/reporting/screens/reportingLogic.ts`, the functions
  `fromDateInput`, `toDateInput` and `defaultRange`.
- `packages/web/test/reporting-reportingLogic.test.ts`, the three assertions
  that encode the UTC output.
- `packages/web/src/areas/reporting/components.tsx:31-43` is the only caller
  of the two functions. It reaches them through the two `<input type="date">`
  controls, and it stays as it is. The signatures do not move.
- `openspec/specs/reporting-app/spec.md`.
- `package.json`, a `test:tz` script chained into `check`. The container runs
  UTC, so the plain suite skips the one test that catches this fault. Without
  the script the push gate never runs the guard.
- No engine, schema or HTTP code. `src/engine/reporting.ts` compares the two
  instants it receives and stays as it is.
