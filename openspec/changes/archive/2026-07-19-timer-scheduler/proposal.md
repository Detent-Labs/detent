## Why

The schema already makes timers first-class on a step (`step.timers[]`, with
`instance.timers[]` for persisted fire times and `cause: "timer"` on history),
but the engine never arms or fires them. Without timers an automatic wait-state
has no bound: an instance that parks with no matching guard waits forever. Timers
are the deadline/escalation/reminder mechanism the roadmap's engine skeleton (#3)
calls for, and the last transition path (alongside manual and automatic) still
missing from the executor.

## What Changes

- Arm a step's timers on entry: compute each timer's `fireAt` (`duration` from the
  entry instant) and persist it into `instance.timers[]`. Disarm on exit (the next
  step's timers replace them). `deadline` timers are out of scope for v1 (see
  Impact); the schema and authoring-time validation already carry them, only the
  engine evaluator is deferred.
- Add a timer scheduler that polls for due, unfired timers and fires them,
  surviving restarts (fire times are persisted, so recovery is a re-scan).
- Fire a **transition timer** (`onFire.targetPath`) as a forced transition down
  that path, **bypassing the target path's guard**, with `cause: "timer"`; run
  its `onFire.actions` and the normal trigger actions, then run the instance to
  rest via the existing automatic cascade.
- Fire a **reminder timer** (`onFire.actions`, no `targetPath`) as a side effect
  only: enqueue its actions, mark the timer fired, stay on the step.
- Make redundant fires idempotent: firing reuses the transition's optimistic-
  concurrency token (and a fired-guard for reminders), so two pollers or a
  post-crash re-scan fire a timer at most once.

## Capabilities

### New Capabilities
- `timers`: arming timers at step entry, persisting fire times, the polling
  scheduler, and the two firing semantics (transition vs reminder), including
  guard-bypass and crash recovery.

### Modified Capabilities
<!-- None. transition-execution's onExit->onPath->onEntry ordering and the outbox
     are reused as-is; this change consumes them without altering their requirements. -->

## Impact

- **Schema**: none — `timer`, `timerState`, and `cause: "timer"` already exist in
  `src/schema/definition.ts`.
- **Engine**: `src/engine/transition.ts` (arm/disarm timers inside the transition
  commit; a timer-fire entry point); a new `src/engine/timers.ts` scheduler
  mirroring the `outbox.ts` poll/claim worker; `src/engine/store.ts` (an indexed
  `next_timer_at` column for efficient polling).
- **CEL**: none. `deadline` evaluation is deferred — `now()`/`timestamp()`/
  `duration()` are forbidden in every CEL expression (`src/cel/check.ts`), so a
  `deadline` can only pass through a field already holding an absolute timestamp,
  no example exercises it, and the field-type/coercion story is unresolved. v1
  ships `duration` timers only.
- **Reused unchanged**: the outbox (timer-fired actions flow through it) and the
  transition executor's trigger ordering.
- **Tests**: a `test/timer.test.ts` exercising arm-on-entry, transition fire with
  guard bypass, reminder fire, disarm-on-exit, and fire-once idempotency.

## Dependency

This change assumes, but does not build, re-resolution of automatic paths after an
async action writeback. Today `resolveAutomatic` runs only on a manual transition
and at instance start; the outbox writeback applies its data patch but does not
re-drive automatic evaluation. So an automatic wait-state (e.g. the `book` step in
`examples/expense-approval.json`) never takes its result-driven *happy* path — only
its timer fires. Timers are the fallback edge and are correct on their own, but the
wait-state pattern they bound is incomplete until that re-resolve exists. Built as a
separate prerequisite change, `reresolve-after-writeback`, which should land first.
