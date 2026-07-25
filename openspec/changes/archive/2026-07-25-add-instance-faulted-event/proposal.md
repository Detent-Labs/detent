## Why

Parking a looped instance is the only state change in the engine that leaves no
trace in the runtime record. `markFaulted` (`src/engine/transition.ts`) flips
`status` to `faulted` with a bare `UPDATE` — no `HistoryEntry` (correct: there is
no step change) and no `InstanceEvent` (a gap: that is exactly what
`InstanceEvent` exists for). The loop error naming the repeated step is thrown to
the caller and then gone; nothing persisted says *why* an instance sits
`faulted`, and "parked forever, why?" is the diagnostic the runtime record is
supposed to answer. This resolves the trigger-less debt marker at
`transition.ts:658`.

## What Changes

- New `InstanceEvent` kind `instance.faulted`, payload
  `{ stepId, reason: "automatic-cascade-loop" }` — the repeated step that ended
  the cascade, and why the instance was parked.
- `markFaulted` appends that event in the **same transaction** as the status
  flip, at the instance's current `transitionSeq`. No seq advance, no
  `HistoryEntry` — the `migration.skipped` / `assignment.claimed` shape, not the
  `timer.fired` one (the park enqueues no actions, so the event carries no
  `ActionOutcome`s).
- `reason` is a single-member enum, mirroring `migrationSkipReason` /
  `timerUnarmedReason`. The cascade loop is the only fault cause today; the enum
  is how a second one is added without changing the payload shape.

No breaking changes: the kind is additive, the discriminated union is open to
readers that switch on `kind`, and no existing event or history record changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `automatic-transitions`: the "A cascade terminates on a repeated step"
  requirement gains the persisted audit record — the park is currently specified
  as a status flip plus a thrown error only.

## Impact

- `src/schema/definition.ts` — a ninth arm on the `instanceEvent` discriminated
  union plus its reason enum. This is a contract change, so it is deliberate:
  additive only, no existing arm touched.
- `src/engine/transition.ts` — `markFaulted` becomes transactional
  (`db.begin`) and calls `appendInstanceEvent`. Its call site in
  `resolveAutomatic` is unchanged; `db` there is never an already-open
  transaction (every caller passes the top-level `sql` or a pool handle after
  its own commit returned).
- `openspec/specs/automatic-transitions/spec.md` — delta.
- `CLAUDE.md` / `docs/current-state.md` — the "Runtime record" section
  enumerates the event kinds by name and count; both need the ninth.
- `PONYTAIL-DEBT.md` — the `transition.ts:658` marker is removed, dropping the
  ledger to 11 markers and 1 with no trigger.
- No migration: `instance_events` is schema-less on `kind` (a text column), so
  existing rows and readers are unaffected.
