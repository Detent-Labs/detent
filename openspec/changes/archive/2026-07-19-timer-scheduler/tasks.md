## 1. Storage

- [x] 1.1 In `store.ts#initSchema`, add idempotent `ALTER TABLE instances ADD COLUMN IF NOT EXISTS next_timer_at timestamptz` and a `CREATE INDEX IF NOT EXISTS` on `next_timer_at`.

## 2. Fire-time computation

- [x] 2.1 Add a helper that computes a `duration` timer's `fireAt` = entry instant + ISO-8601 duration. `deadline` timers are out of scope (deferred); ignore them when arming and leave the schema/authoring-validation as-is.

## 3. Arm / disarm on transition

- [x] 3.1 In `commitTransition`, compute the target step's armed `instance.timers[]` (each timer with its `fireAt`, `fired` unset) and write them into the body in the same transaction, replacing the source step's timers.
- [x] 3.2 In the same commit, set `next_timer_at` to the min unfired `fireAt` of the armed set (NULL when none), and promote it to the `next_timer_at` column.
- [x] 3.3 Verify arm-on-entry and disarm-on-exit via the existing manual/automatic paths (no timers carried across a step boundary).
- [x] 3.4 Arm the INITIAL step's timers atomically inside `createInstance`'s INSERT (creation is a step entry). Must be in the same write as the INSERT — a separate post-INSERT UPDATE leaves a crash window that permanently strands the timer (no worker re-arms a `next_timer_at=NULL` running instance). If the instance later transitions off the initial step, the first commit re-arms the resting step. Regression test: an initial timer-bearing wait-state is armed at seq 0.

## 4. Firing

- [x] 4.1 Add `fireTimer(instance, timerId, body, db)` to `transition.ts`: resolve the timer on the current step; branch on `onFire.targetPath` present vs absent.
- [x] 4.2 Transition timer: commit a forced transition down `onFire.targetPath` with `cause: "timer"`, skipping guard evaluation, with actions ordered `onFire.actions -> onExit -> onPath -> onEntry`; reuse the OCC predicate so a redundant fire loses with `ConcurrencyConflict`; then `resolveAutomatic` to rest.
- [x] 4.3 Reminder timer (no `targetPath`): in one transaction, enqueue `onFire.actions` to the outbox and set the timer's `fired` flag with a conditional update keyed on `WHERE transition_seq = <observed> AND` the timer-not-yet-fired; no seq bump, no HistoryEntry. The seq predicate makes a reminder on an instance that has since moved off the step a no-op (avoids flipping `fired` on a replaced `timers[]`); the fired predicate blocks re-fire on a later poll.

## 5. Scheduler

- [x] 5.1 Add `src/engine/timers.ts` with a poll pass that selects instances `WHERE next_timer_at <= now()` and status running, and calls `fireTimer` for each due unfired timer.
- [x] 5.2 Add a `startTimerScheduler` loop with a configurable interval, mirroring `startOutboxWorker`; swallow per-instance `ConcurrencyConflict` (lost race) and continue.
- [x] 5.3 Recompute/clear `next_timer_at` after a reminder fire so a fired-but-not-transitioned timer is not re-selected every tick.

## 6. Tests

- [x] 6.1 `test/timer.test.ts`: duration timer armed with correct `fireAt` on entry; a step without timers arms nothing.
- [x] 6.2 Transition timer fires down its target path with a false guard; history entry `cause: "timer"`; `onFire.actions` land in the outbox.
- [x] 6.3 Reminder timer enqueues actions, marks `fired`, leaves `currentStepId`/`transitionSeq` unchanged; a second poll does not re-enqueue.
- [x] 6.4 Disarm: taking a normal transition off a timer-bearing step before `fireAt` leaves the timer unfired and absent on the next step.
- [x] 6.5 Fire-once under concurrency: two `fireTimer` calls on the same due transition timer yield exactly one committed transition.
- [x] 6.6 Overdue-after-restart: an instance with an elapsed `fireAt` fires on the first scheduler pass.

## 7. Verify

- [x] 7.1 `bun run typecheck` clean; `bun test` green.
