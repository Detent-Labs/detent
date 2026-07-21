# Initial-Step Subprocess Spawn

## Why

A definition whose `initialStep` is a `subprocess` step never spawns its child:
the `core.spawnSubprocess` enqueue lives in `planStepEntry`, which only runs on
transitions, while `createInstance` — the seq-0 step-entry path — arms timers but
enqueues nothing. Such an instance parks on its initial wait-state forever with
no child, no error, and nothing recording why. This is the last "Remaining" item
of subprocess execution on the roadmap, and it also blocks the natural
composition where a child process is itself a thin wrapper that immediately
delegates to another subprocess.

## What Changes

- `createInstance` enqueues the `core.spawnSubprocess` outbox row when the
  definition's `initialStep` is a `subprocess` step, inside the same transaction
  as the instance INSERT and guarded by the same `RETURNING` check (a
  conflicting re-insert — a redelivered spawn of this instance itself — enqueues
  nothing, exactly as it appends no events).
- The spawn is enqueued at `transitionSeq` 0, so the deterministic child id and
  the idempotency key derive from `(instanceId, 0, stepId)` — the existing spawn
  handler needs no change; nesting (a child whose own initial step is a
  subprocess) composes through the outbox with no special casing.
- A new `InstanceEvent` kind, `subprocess.spawn-enqueued`, is recorded at seq 0
  in the creation transaction and named by the spawn row's `event_id`, so the
  spawn's `ActionOutcome` attaches to it at delivery. Without a carrier the
  outcome is silently discarded: the fallback targets the HistoryEntry at
  `(instanceId, 0)`, which does not exist — the exact failure `event_id` was
  introduced to close for reminder fires. Additive union member in
  `definition.ts` (the `migration.skipped` precedent); a deliberate schema
  change, made for this reason only.
- The `core.` action-type constants move to `registry.ts` (a leaf module) so
  `store.ts` can reference `SPAWN_ACTION_TYPE` without importing
  `transition.ts` (which imports `store.ts`); `transition.ts` re-exports them
  so existing importers are untouched.
- No change to the authored definition contract and no new validation: a
  subprocess initial step was always accepted; it now executes instead of
  stranding.

Out of scope: onEntry actions of the initial step at creation remain not
enqueued. That is a separate, deliberate property of creation-is-not-a-transition
and would need its own change; this change adds only the spawn consequence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `subprocess-execution`: the "Spawn a child instance on entry to a subprocess
  step" requirement currently triggers only on a committed *transition* into the
  step. It gains: instance *creation* at an initial subprocess step SHALL also
  spawn, post-commit, idempotently, at sequence 0 — including a subprocess child
  whose own initial step is a subprocess step (nested spawn chains).
- `runtime-events`: the event union gains `subprocess.spawn-enqueued`, the
  seq-0 record that carries the creation-enqueued spawn's `ActionOutcome`
  (the `timer.fired` precedent: an "actions enqueued, no transition" record).

## Impact

- `src/engine/store.ts` — `createInstance` gains the conditional spawn-row +
  event insert (persistence-only: no actor, no guard evaluation, keeping its
  remit).
- `src/schema/definition.ts` — additive `InstanceEvent` union member.
- `src/engine/registry.ts` / `src/engine/transition.ts` — `SPAWN_ACTION_TYPE` /
  `RETURN_ACTION_TYPE` re-homed to break the would-be import cycle;
  re-exported from `transition.ts`.
- `src/engine/subprocess.ts` — no behavioural change expected; the spawn handler
  already keys on `(parentId, parentSeq, stepId)` from its config.
- `test/subprocess.test.ts` (or a sibling) — new tests: create-at-subprocess
  spawns and returns; redelivered create enqueues once; nested initial-step
  chain; parent no longer running at delivery is skipped.
