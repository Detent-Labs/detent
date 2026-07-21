# Design — Initial-Step Subprocess Spawn

## Context

Entering a `subprocess` step enqueues `core.spawnSubprocess` — but only in
`planStepEntry` (`transition.ts`), which runs on transitions. Creation is a
deliberately separate step-entry path: `createInstance` (`store.ts`) inserts the
instance at `initialStep`, `transitionSeq` 0, no `HistoryEntry`, arms the initial
step's timers atomically in the INSERT transaction — and enqueues nothing. A
definition whose `initialStep` is a subprocess step therefore parks forever: the
step is a wait-state (its automatic paths guard on `child.outcome`, absent from
the standard guard context), and no child ever arrives to produce that namespace.

Relevant machinery already in place:

- The spawn handler (`subprocess.ts::makeSpawnHandler`) reads everything from its
  config `{ subprocessStepId, parentSeq }` plus the parent row; it has no
  assumption that `parentSeq > 0`.
- The deterministic child id (`idempotency.ts::subprocessChildId`) and the outbox
  idempotency key are pure functions of `(instanceId, seq, id)` — seq 0 is as
  valid a coordinate as any.
- `createInstance` already appends seq-0 `InstanceEvent`s (`timer.unarmed`)
  guarded by the INSERT's `RETURNING` check, so "record things in the creation
  transaction, but only when the INSERT actually created the row" is established.
- `ActionOutcome` routing: `outbox.appendOutcome` attaches to the `InstanceEvent`
  named by the row's `event_id`, else to the `HistoryEntry` at
  `(instance_id, transition_seq)`. At seq 0 no `HistoryEntry` exists — the
  fallback UPDATE matches no row and the outcome is silently discarded, the exact
  failure mode `event_id` was introduced to close for reminder fires.

## Goals / Non-Goals

**Goals:**

- An instance created on a subprocess `initialStep` spawns its child, parks as a
  wait-state, and is driven off it by the child's return — top-level creations
  and subprocess children alike (nested initial-step chains compose).
- The spawn stays idempotent under redelivery and under a redelivered creation of
  the instance itself (a spawn handler retry re-running `createInstance`).
- The spawn's `ActionOutcome` lands on a queryable runtime record, not nowhere.
- No crash window between the instance existing and its spawn being enqueued.

**Non-Goals:**

- onEntry actions of the initial step at creation. Creation remains
  not-a-transition: no `HistoryEntry`, no trigger actions. This change adds the
  spawn consequence only. (If onEntry-at-creation ever lands, the outcome-carrier
  event introduced here is the natural place for those outcomes too.)
- Any contract change to `ProcessDefinition` — a subprocess initial step already
  parses and publishes; only the runtime record (`InstanceEvent` union) grows.
- Upward/independent cancel semantics — unchanged.

## Decisions

### D1: Enqueue in `createInstance`, inside the INSERT transaction

`createInstance` gains: when `body.workflow.steps` resolves `initialStep` to a
step with `type === "subprocess"`, insert the spawn outbox row
(`action_spawn_<stepId>`, config `{ subprocessStepId, parentSeq: 0 }`, key
`idempotencyKey(instanceId, 0, actionId)`) in the same transaction as the
instance INSERT, after the `RETURNING` guard — exactly where the seq-0
`timer.unarmed` events already land.

- *Why not `startInstance`?* Two reasons. A post-create enqueue leaves a crash
  window that permanently strands the instance (no worker re-enqueues a parked
  seq-0 subprocess step) — the same argument that moved timer arming into the
  INSERT. And the spawn handler creates children via `createInstance` directly,
  so a nested chain (a child whose own initial step is a subprocess) would
  silently miss the enqueue.
- *Why not route creation through `planStepEntry`?* The seam plans a
  *transition*: it increments the sequence and mints a `HistoryEntry`, both of
  which creation must not do. Restating one outbox row is smaller than teaching
  the seam a seq-0/no-entry mode.
- *Why not forbid subprocess initial steps at publish?* It rejects a legitimate
  composition (a thin contracted wrapper that immediately delegates) to avoid a
  small engine fix, and the contract has always accepted the shape — a publish
  error now would be a regression for stored definitions.

The `RETURNING` guard gives creation-idempotency for free: a redelivered spawn
that re-runs `createInstance` for an existing child inserts nothing, returns
early, and enqueues nothing — no `ON CONFLICT` needed on the outbox insert.

### D2: A `subprocess.spawn-enqueued` event carries the spawn's `ActionOutcome`

`createInstance` appends one `InstanceEvent` of a new kind —
`subprocess.spawn-enqueued`, payload `{ stepId }` (strict), envelope at seq 0 —
in the creation transaction, and the spawn outbox row is inserted with
`event_id` set to that event's id. Like `timer.fired` (the precedent for an
"actions enqueued, no transition" record), the kind carries an optional
`actions: ActionOutcome[]` that `appendOutcome` fills at delivery.

- *Why an event at all?* Without one, the spawn's outcome is discarded: the
  `event_id`-less fallback targets the `HistoryEntry` at `(instanceId, 0)`,
  which does not exist. A dead-lettered initial spawn is precisely the
  "instance parked forever — why?" diagnostic, and the audit backbone's rule is
  that an `ActionOutcome` attaches to the record that enqueued the action. The
  outbox row itself is operational state, not the audit record.
- *Why not a universal `instance.created` event?* Creation is reconstructable
  (the instance row carries `startedAt`, seq 0 is implied), so a per-instance
  event adds volume without recording a new fact; and appending it *only* for
  subprocess-initial instances would make the name lie. The narrow kind records
  exactly the one fact that is otherwise lost.
- Transition-entered subprocess steps are untouched: their spawn rows keep
  `event_id` NULL and their outcomes keep attaching to the transition's
  `HistoryEntry`.

This is an additive `InstanceEvent` union member in `definition.ts` — the
settled additive path (`migration.skipped` precedent) — and a deliberate schema
change, made for this reason and nothing else.

### D3: Re-home `SPAWN_ACTION_TYPE` / `RETURN_ACTION_TYPE` in `registry.ts`

`store.ts` cannot import them from `transition.ts` (`transition.ts` imports
`store.ts`; the constants were homed there to avoid exactly this cycle with
`subprocess.ts`). `registry.ts` is a leaf (imports only `zod` types and the
schema) and is conceptually where reserved `core.` action types belong.
`transition.ts` re-exports both so existing importers (`subprocess.ts`, tests)
are untouched. `store.ts` additionally imports `idempotencyKey` from
`idempotency.ts` (also a leaf).

### D4: No handler, resolution, or cancel changes

- The spawn handler works unchanged: `parentSeq: 0` flows into
  `subprocessChildId(parentId, 0, stepId)`; the parent-running check, the
  cancel/spawn race backstop, and the child run-to-rest are coordinate-agnostic.
- The return handler works unchanged: a parent parked at its initial step
  satisfies the `currentStepId === parent.stepId` check, and
  `executeAutomaticTransition` commits from seq 0 under the same OCC predicate.
- `startInstance`'s `resolveAutomatic` after creation is already a no-op on the
  wait-state (guards referencing `child.` evaluate false in the standard
  context), so the instance is returned parked, spawn pending — consistent with
  post-commit dispatch everywhere else.
- Cancellation: a parent cancelled while the creation-spawn is queued is skipped
  by the handler's status check; the existing self-cancel backstop covers the
  race where the cascade ran before the child existed.
- Migration: an instance whose seq-0 spawn row is undelivered is skipped
  `pending-actions` by the existing outbox check — correct and already recorded.

## Risks / Trade-offs

- **[Schema growth]** A third-party consumer of the event log sees a new kind.
  → The union is explicitly designed for additive kinds; the discriminated
  union means old kinds parse exactly as before. (Stored events are never
  re-parsed against a *narrower* schema — this widens.)
- **[`createInstance` scope creep]** The store's remit is "pure to persistence:
  no actor, no guard evaluation". The spawn enqueue evaluates nothing — it is a
  static function of the body's initial step and the instance id — so the remit
  holds, but the function now knows one step type. → Accepted; the alternative
  homes (D1) are worse. The comment on `createInstance` states the boundary.
- **[Silent-discard hazard if D2 is skipped]** Implementing D1 without D2 works
  functionally but silently discards the spawn outcome — invisible in every
  happy-path test. → The spec makes the outcome attachment a requirement with
  its own scenario, so verification cannot pass without it.
- **[Duplicate-enqueue hazard]** If the outbox insert were placed outside the
  `RETURNING` guard, a redelivered child-creation would violate the outbox PK
  (same deterministic key) — loud, not silent, but still a handler failure.
  → Placement inside the guard is a spec scenario (redelivered creation
  enqueues nothing).

## Open Questions

None — the mechanism reuses settled machinery end to end.
