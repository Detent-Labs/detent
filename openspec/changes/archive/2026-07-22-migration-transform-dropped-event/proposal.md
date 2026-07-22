## Why

A migration `transforms` expression that raises, or whose result cannot be
made JSON-safe, leaves its target field unwritten — total, like a guard
(`src/cel/eval.ts::evalTransforms`, `src/engine/migration.ts::remapData`).
This is the correct behavior (a mid-flight instance with incomplete data is
normal, and failing the migration would strand exactly the instances
migration exists to move), but the omission today is silent: nothing records
that it happened. The `timer.unarmed` precedent (an analogous total-but-lossy
operation) already establishes the house rule for this shape of gap: an
omission a migration or entry commits through unconditionally must still be
queryable, even though the operation itself does not fail. CLAUDE.md lists
this exact item under "Decided, not yet built."

## What Changes

- `evalTransforms` (`src/cel/eval.ts`) changes its return shape from a bare
  patch object to `{ patch, drops }` — mirroring `armStepTimers`'s `{ armed,
  drops }` — where `drops` names each target `FieldId` whose transform did
  not write, and why: `"expression-raised"` (the CEL evaluation itself
  threw) or `"value-out-of-range"` (evaluation succeeded but the result
  could not be made JSON-safe, e.g. a bigint outside the safe-integer
  range). These are the two distinct total-failure points the function
  already has, previously collapsed into one silent catch.
- `remapData` (`src/engine/migration.ts`) threads `drops` through to its
  caller alongside the computed `data` patch.
- A new `InstanceEvent` kind, `migration.transform-dropped`, is added
  additively to the discriminated union in `src/schema/definition.ts`. Its
  payload names the instance, version, `transitionSeq` in force, the target
  `fieldId`, and the reason. Like `timer.unarmed`, `migration.skipped`, and
  `subprocess.outcome-unmatched`, it enqueues no actions and carries no
  `ActionOutcome`s.
- `migrateOne` (`src/engine/migration.ts`) — the per-instance function
  `migrateInstances`' keyset-pagination loop calls, which already owns the
  `timer.unarmed` drop-event construction — records one
  `migration.transform-dropped` event per dropped transform, in the same
  commit as the migration itself (via the shared step-entry seam's `events`
  channel, the same mechanism already used for `timer.unarmed` drops from
  timer reconciliation) — the migration is never failed by a drop.
- No change to the *behavior* of a raising transform: its target still ends
  up unwritten, exactly as today. This change only makes that fact
  retrievable.

## Capabilities

### Modified Capabilities
- `runtime-events`: gains a sixth `InstanceEvent` kind,
  `migration.transform-dropped`, recorded when a `transforms` entry fails to
  write its target during a migration.
- `instance-migration`: the "transforms compute target values from the
  pre-migration data" requirement gains the recording detail — a dropped
  transform is now queryable, not only inferable from an absent field.

## Impact

- `src/cel/eval.ts`: `evalTransforms`'s return type changes (its only two
  callers are `remapData` and one direct unit test — see below).
- `src/schema/definition.ts`: additive — a new discriminated-union member on
  `instanceEvent`, plus a `migrationTransformDroppedReason` enum
  (`"expression-raised" | "value-out-of-range"`), mirroring
  `timerUnarmedReason`'s shape.
- `src/engine/migration.ts`: `remapData`'s return type changes (its only
  caller is `migrateOne`, the per-instance function, in the same file);
  `migrateOne` builds and appends the new event kind alongside the existing
  `timer.unarmed` drop-event construction.
- `test/cel.test.ts`: the one direct `evalTransforms` call updates to the new
  `{ patch, drops }` return shape.
- `test/migration.test.ts`: the existing "a raising transform leaves its
  field unwritten" test gains an assertion that the drop event now exists; a
  new test covers the `value-out-of-range` reason and the "no drop on
  success" case.
