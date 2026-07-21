## Why

A `faulted` instance is documented as a dead-end error park (`action-handlers`
spec: "Only a `running` instance accepts a writeback. A `faulted` instance is a
dead-end error park") and `cancelInstance` already enforces that by no-oping on
any non-`running` instance. But `executeManualTransition` and `fireTimer` never
check status at all, and `markFaulted` flips status to `faulted` without
bumping `transitionSeq` — so the commit's optimistic-concurrency predicate
(`instance_id + transition_seq` only) still matches after a fault. A faulted
instance can therefore still take a manual or timer transition, including a
faulted subprocess child advancing to terminal and enqueueing a real
subprocess return into its parent. This silently voids the "dead-end park"
guarantee the rest of the engine (writeback suppression, migration's
untouched-if-faulted rule) already relies on.

## What Changes

- `executeManualTransition` rejects (no-op, matching `cancelInstance`'s
  established convention) when the instance is not `running`, before
  evaluating the path or committing.
- `fireTimer` rejects the same way for both branches (a transition timer
  forcing a path, and a reminder timer enqueueing actions) when the instance
  is not `running`.
- Regression tests covering both directions: a faulted instance offered a
  manual transition and a faulted instance with a due timer (transition-timer
  and reminder-timer) each leave the instance unchanged (no `HistoryEntry`, no
  `transitionSeq` bump, no enqueued outbox row).

No schema change. No change to `cancelInstance`, `markFaulted`, or any other
entry point. Not breaking: the current behavior (advancing a faulted instance)
is an unintended gap, not a documented or exercised capability, and every
other status-gated entry point in the engine already treats `faulted` as
terminal.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `transition-execution`: manual and timer transitions now require the
  instance to be `running`; a non-running instance (including `faulted`) is a
  no-op identical in shape to `cancellation`'s non-running no-op.

## Impact

- `src/engine/transition.ts`: `executeManualTransition`, `fireTimer`.
- `test/transition.test.ts` (or the relevant existing transition/timer test
  file): new regression cases.
- No API, schema, or migration impact.
