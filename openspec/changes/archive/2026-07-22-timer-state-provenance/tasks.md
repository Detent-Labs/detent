## 1. Schema

- [x] 1.1 In `src/schema/definition.ts`, add `export const timerProvenance = z.discriminatedUnion("kind", [...])` with two branches: `{ kind: "duration", duration, armedAt: timestamp }` and `{ kind: "deadline", src: z.string(), armedAt: timestamp }`. Export `TimerProvenance`.
- [x] 1.2 Add `provenance: timerProvenance.optional()` to `timerState`.
- [x] 1.3 Run `tsc --noEmit` to confirm the additive schema change compiles clean (it should — no existing code constructs a `TimerState` literal that would now be missing a required field, since `provenance` is optional).

## 2. Arming records provenance

- [x] 2.1 In `src/engine/duration.ts::armStepTimers`, the `duration` branch: push `provenance: { kind: "duration", duration: t.duration, armedAt: entryInstant }` alongside `fireAt` on the armed `TimerState`.
- [x] 2.2 The `deadline` branch: push `provenance: { kind: "deadline", src: t.deadline.src, armedAt: entryInstant }` alongside `fireAt`.
- [x] 2.3 Confirm (read, don't change) that `store.ts` and `transition.ts` need no edits — both call `armStepTimers` and persist its `armed` array unmodified, so provenance flows through automatically.
- [x] 2.4 `test/duration.test.ts:311-314` ("arming raises when a bound-valid duration overflows...") asserts the exact return shape of `armStepTimers` via `toEqual({ armed: [{ timerId, fireAt }], drops: [] })`. Updated the expected object to include `provenance: { kind: "duration", duration: "P365D", armedAt: "2026-07-20T12:34:56.789Z" }`.

## 3. Migration reconciliation

- [x] 3.1 In `src/engine/migration.ts`, add a helper `timerProvenanceMatches(carried: TimerProvenance | undefined, declared: Timer): boolean` — `undefined` carried provenance matches (trust-legacy); otherwise compare `kind` and (`duration` for `"duration"`, `src` for `"deadline"`) against the declared timer's own source, ignoring `armedAt`.
- [x] 3.2 Rewrite `reconcileTimers`'s partitioning: for each carried timer whose id is still declared — if `fired`, keep as-is; else if `timerProvenanceMatches(...)`, keep as-is; else, add its id to the set fed into the existing `armStepTimers` re-arm call (the same call that already handles genuinely-newly-declared timers) instead of the `kept` array.
- [x] 3.3 Reworked the arm-set selection to "not carried OR provenance-mismatched-and-unfired" and rewrote the comment above it accordingly.

## 4. Tests

- [x] 4.1 `test/duration.test.ts`: new test "an armed duration timer records provenance matching its declared source"; `test/timer.test.ts`'s existing deadline-arming test extended to assert `provenance` too.
- [x] 4.2 `test/migration.test.ts`: "6.8 a redeclared duration is detected and re-armed at the migration instant."
- [x] 4.3 `test/migration.test.ts`: duration→deadline flip, deadline→duration flip, and changed-deadline-source — three separate tests.
- [x] 4.4 `test/migration.test.ts`: existing "6.8 timer reconciliation..." test passes unmodified (verified — unchanged duration still matches provenance and is kept).
- [x] 4.5 `test/migration.test.ts`: "6.8 a fired timer is kept even if its declaration changed."
- [x] 4.6 `test/migration.test.ts`: "6.8 a carried timer with no provenance is trusted and kept even if the declaration changed."
- [x] 4.7 Ran the full suite inside the devcontainer: 444 pass, 0 fail, 0 skip.

## 5. Docs

- [x] 5.1 Removed the "`TimerState` provenance" bullet from "Decided, not yet built" and added a description to the Roadmap #3 "Engine skeleton" bullet describing where provenance is recorded and consumed.
