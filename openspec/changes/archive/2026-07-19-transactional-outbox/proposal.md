## Why

The transition executor orders trigger actions (onExit → onPath → onEntry) but
runs them through a no-op `dispatch` seam (`src/engine/transition.ts:34`): side
effects are never delivered. Without a durable delivery path, a crash between the
state commit and dispatch loses the actions entirely, and a redelivery would run
them twice. This change replaces the seam with a transactional outbox so actions
are enqueued atomically with the commit and delivered effectively-once.

## What Changes

- Add an `outbox` table; enqueue one row per ordered trigger action **inside the
  same transaction** as the state / `transitionSeq` commit (atomic — no action is
  lost or dispatched for an uncommitted transition).
- Replace the no-op `dispatch` seam in the transition executor with the atomic
  enqueue.
- Add a delivery worker that dispatches queued rows at-least-once to a handler
  seam and marks them delivered.
- Idempotency key = UUIDv5 of `instanceId + transitionSeq + actionId`; combined
  with at-least-once delivery this yields effectively-once execution. Redelivery
  of an already-handled key is a no-op.
- Handler execution is a seam (invoke + mark delivered); concrete handler
  registration and `Action.output` result-writeback are **out of scope** (a
  follow-up change).
- Recording per-action `ActionOutcome` into `HistoryEntry.actions` is **out of
  scope**: `ActionOutcome.resolvedHandler` needs the deferred handler registry,
  so this slice leaves `HistoryEntry.actions` empty (the field is already
  `optional()` in the contract). The outbox row carries delivery state; the
  audit back-fill lands with the handler-registry change.

## Capabilities

### New Capabilities
- `transactional-outbox`: durable at-least-once delivery of transition side
  effects — the ordered trigger actions (onExit → onPath → onEntry) are enqueued
  one outbox row each **atomically with the state + `transitionSeq` commit**, a
  delivery worker dispatches them post-commit, and a UUIDv5 idempotency key makes
  redelivery a no-op (effectively-once). The atomic-enqueue requirement lives
  here and references the transition commit; it fills the ordered dispatch seam
  additively without changing the `transition-execution` requirement text.

### Modified Capabilities
<!-- None. The outbox is additive to the existing ordered dispatch seam; the
     transition-execution requirement ("executes onExit → onPath → onEntry")
     stays true — the seam simply no longer no-ops. -->
- _(none)_

## Impact

- **Code:** `src/engine/transition.ts` (replace `dispatch` seam with enqueue);
  new outbox module (schema init + worker) alongside `src/engine/store.ts`.
- **Schema (DB):** new `outbox` table, created by the idempotent schema init.
- **Contract (`src/schema/definition.ts`):** unchanged — no process-definition
  change.
- **Tests:** enqueue is atomic with the commit (no rows on a rejected/stale
  transition); worker delivers each row once; redelivery of a handled
  idempotency key is a no-op.
- **Out of scope (follow-up):** handler registry and `Action.output`
  result-writeback into `data`.
