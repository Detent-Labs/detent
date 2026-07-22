## Context

`evalTransforms` (`src/cel/eval.ts:105-121`) evaluates each `transforms`
entry over the pre-migration snapshot and writes the result into a patch,
total: either `evaluate()` throws (an unresolvable reference — most commonly
a field the instance never wrote) or the result survives evaluation but
`coerceJson` throws a `RangeError` on a bigint outside
`Number.MAX_SAFE_INTEGER` (a CEL `int` literal or arithmetic result too
large to represent as a JSON number). Both are caught and silently drop that
one field from the patch; the function returns only the patch, so the two
distinct causes are indistinguishable to every caller and unobservable to
every reader of the instance.

`remapData` (`src/engine/migration.ts:225-242`) calls `evalTransforms` and
merges its patch into the computed `data`. Its only caller, `migrateOne`
(the per-instance function `migrateInstances`' keyset-pagination loop
invokes for each id — not `migrateInstances` itself, which never touches
`data` or `drops` directly), already has a directly analogous precedent one
call away: `reconcileTimers` returns `{ timers, drops }`, and its `drops`
are turned into `timer.unarmed` `InstanceEvent`s appended via
`planStepEntry`'s `events` channel, in the same commit as the migration —
the exact mechanism this change reuses.

## Goals / Non-Goals

**Goals:**
- Make a dropped `transforms` entry queryable, distinguishing the two
  existing failure causes.
- No change to migration's behavior: a raising or overflowing transform
  still leaves its target unwritten, and the migration still commits.
- Reuse the `timer.unarmed` event-plumbing pattern exactly, since it is
  architecturally identical: a total, per-item drop discovered before the
  commit, recorded in the same commit via the shared seam's `events` option.

**Non-Goals:**
- An `ActionOutcome` carrier. This event enqueues nothing (`migration.skipped`
  and `subprocess.outcome-unmatched` are the precedent for an event with no
  `actions` field).
- Widening `evalTransforms`'s or `coerceJson`'s failure taxonomy beyond the
  two causes that already exist in the code. No new failure mode is being
  introduced; this change only makes the existing two observable.
- Retrying or repairing a dropped transform. Identical posture to
  `timer.unarmed`: the fact becomes retrievable, the instance does not
  self-heal.

## Decisions

### `evalTransforms` returns `{ patch, drops }`, mirroring `ArmedTimers`

```ts
export type TransformDrop = { fieldId: FieldId; reason: MigrationTransformDroppedReason };
export function evalTransforms(spec, fromBody, snapshot): { patch: Record<string, unknown>; drops: TransformDrop[] };
```

The two existing try/catch points split into two: the first around
`evaluate()` (reason `"expression-raised"`), the second around
`coerceJson()` (reason `"value-out-of-range"`) — currently one combined
try/catch spanning both calls. This is the same split `armStepTimers`
already makes between its deadline-evaluation catch (`"expression-raised"`)
and its `instantFromValue` null-check (`"not-an-instant"`): two distinct,
already-total failure points, now individually named instead of collapsed.

**Alternative considered:** a single generic `"failed"` reason. Rejected —
`timerUnarmedReason` already sets the precedent that a caller of `evalTransforms`
has enough information in hand to distinguish "the expression itself is
broken" (an authoring/data problem — the referenced field was never
written) from "the expression works but its result can't be stored" (an
overflow, a genuinely different class of problem), and collapsing them
loses information the code already has for free.

### `remapData` threads `drops` through; `migrateOne` builds the events

`remapData`'s return type changes from `Instance["data"]` to `{ data:
Instance["data"]; drops: TransformDrop[] }`. `migrateOne` builds one
`migration.transform-dropped` `InstanceEvent` per drop — same `at`,
`transitionSeq` (`nextSeq`), and `version` (`toVersion`) as the existing
`timer.unarmed` drop-event construction just below it in the same function
— and appends both event arrays into the same `events: [...]` passed to
`planStepEntry`. No new commit boundary, no new seam parameter: the
`events` channel already accepts an arbitrary array.

**Why `toVersion`, not the source version:** the target `fieldId` a dropped
transform names is declared in the target catalog — the transform's whole
purpose is to compute a *target* field's value — so, like `timer.unarmed`
(which names a timer declared on the target step), the id resolves against
the version the entry is landing on, not the one it left.

### New event kind: additive, no-outcome shape

```ts
z.object({
  ...instanceEventEnvelope,
  kind: z.literal("migration.transform-dropped"),
  payload: z.object({ fieldId, reason: migrationTransformDroppedReason }).strict(),
}),
```
placed in the `instanceEvent` discriminated union alongside the other
no-outcome kinds (`migration.skipped`, `subprocess.outcome-unmatched`) —
literally the same object shape as `timer.unarmed`'s entry with `timerId`
swapped for `fieldId`. `migrationTransformDroppedReason` is
`z.enum(["expression-raised", "value-out-of-range"])`, the same construction
as `timerUnarmedReason`.

### Placement of the try/catch split stays inside `evalTransforms`, not `remapData`

`remapData` has no CEL knowledge and should not gain any; `evalTransforms`
already owns both `evaluate()` and `coerceJson()` calls, so the distinction
is made where the two failure points already are, exactly as
`armStepTimers` (not its caller) is what knows the difference between its
own two drop reasons.

## Risks / Trade-offs

- **Breaking return-shape change to `evalTransforms`.** Two call sites total
  (`remapData`, one direct unit test in `test/cel.test.ts`) — both updated
  in this change; a compile error catches anything missed.
- **The `value-out-of-range` path has no existing test anywhere in the
  codebase** (confirmed by search — `coerceJson`'s `RangeError` branch was
  previously unreachable from any test, only reachable via `evalOutput`'s
  identical `coerceJson` call, also untested for overflow). This change adds
  the first test for it, using a CEL integer literal
  (`9223372036854775807`, verified via a scratch script to parse as a
  `bigint` exceeding `Number.MAX_SAFE_INTEGER`) rather than an arithmetic
  overflow, for a self-evidently out-of-range fixture.
  **The target field this transform writes MUST be a plugin/custom-typed
  field (CEL `dyn`), not `"number"`.** `registerMigrationPlan` runs
  `validateMigrationSpec` (`src/cel/check.ts`), which type-checks a
  transform's inferred CEL result type against its target field's declared
  type; a `number` field maps to CEL `double`, and a bare int literal infers
  as CEL `int` — the documented `number`→`double` papercut — so the plan
  registration itself would reject the fixture before any instance ever
  migrates. `test/migration.test.ts`'s existing "6.7 data remapping" test
  already worked around exactly this with a plugin-typed `field_total`
  (`type: { type: "counter", config: {} }`, which type-checks as `dyn`); the
  new out-of-range test reuses the same shape.

## Migration Plan

No data migration — purely additive schema (`instanceEvent` gains one union
member) and code (event construction). No feature flag: the event either
gets recorded from this change forward or it doesn't; there is nothing to
roll out gradually.

## Open Questions

None — the TODO item's own list (event kind, per-entry recording, no
`ActionOutcome` carrier, the two required test shapes) is fully addressed
above, and the `timer.unarmed` precedent resolves every design choice that
would otherwise be open.
