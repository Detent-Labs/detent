## Why

Published versions are immutable and instances pin `{processId, version,
definitionHash}`, so an instance rehydrates against exactly the body it started on —
forever. Today that is a one-way door: once a definition is published there is no
supported way to move a running instance onto a newer version. A corrected guard or a
new required field can only reach instances that have not started yet, and
long-running instances accumulate on versions nobody wants to maintain.

Migration is the last unbuilt piece of the engine (roadmap #3) and the one the editor
depends on: an editor that cannot answer "what happens to the 400 instances already
running?" cannot ship a publish button.

## Prerequisites

- **`commit-transition-synthesized-callers`** — required by the whole of section 5
  below. It supplies the plan/apply seam, the derived status, the caller-supplied
  field patch and event list, and the timer/version/spawn overrides. Migration adds no
  commit mechanics of its own.
- **`harden-subprocess-return`** — required for the `subprocess-execution` delta and
  its test to mean anything: it makes the return handler read the child's live parent
  link under a row lock, which is what the link repair below then keeps current.
  Sections 1–4 and 6 do not depend on it.

Neither prerequisite depends on this change.

## What Changes

- **New capability `instance-migration`**: an explicit, operator-invoked operation
  moving running instances from one version of a process onto another version of the
  same process under one rule.
- The rule — the existing `MigrationSpec` (`stepMap`, `fieldMap`, `transforms`,
  `onUnmappable`/`unmappableStep`) — becomes its own persisted entity, a **migration
  plan** keyed `(processId, fromVersion, toVersion)`, registered independently of
  definition publish. It is editable until the first instance migrates under it and
  frozen thereafter by an atomic guard. Several plans may target one version, so
  populations on v1, v2 and v3 all reach v4 without chaining.
- **The definition publish path is not touched.**
- Migration commits through the shared step-entry seam, supplying the reconciled timer
  set, the target version, spawn suppression for an identity migration, its own timer
  drops, and the pin and payload as the field patch. Status, the subprocess spawn, the
  subprocess return and the appended `HistoryEntry` are inherited, not reimplemented.
- Each instance is migrated under a **row lock** held across its read and its commit.
  The concurrency token does not protect `data` — an action writeback modifies one
  field without advancing or checking it — so a payload rewritten from an earlier read
  would erase a concurrent writeback silently.
- **An instance with undelivered outbox rows is not migrated.** It is skipped with its
  own reason and picked up by a later invocation once the outbox drains. An action
  enqueued under the source version carries that version's field ids in its `output`
  map, and there is no sound cheap way to reconcile that at delivery; declining to
  migrate is the honest answer and removes the entire class.
- A migrated instance is recorded as a synthesized transition — `HistoryEntry` with
  `cause: "migration"`, `pathId: null`, the **target** version. A skipped instance is
  recorded as a new `InstanceEvent` kind, `migration.skipped`.
- Timers are reconciled rather than re-armed, so an armed unfired timer whose id
  survives keeps its `fireAt`. This is an explicit exception to `timers`' disarm-on-exit
  rule; the corresponding arming carve-out is made by the prerequisite.
- `transforms` become the last unwired CEL site (roadmap #2), checked against the
  source catalog with their result type checked against the target field.
- Only `running` instances migrate. The operation is keyset-paginated, per-instance
  fault-isolated, and reports instance ids rather than counts.

## Capabilities

### New Capabilities

- `instance-migration`: the plan entity and its lifecycle; which instances migrate;
  step and data remapping; the unmappable and pending-actions policies; how a migration
  and a skip are recorded; timer reconciliation; the parent-link repair; and the
  operation's locking, pagination, fault isolation, idempotency and concurrency
  guarantees.

### Modified Capabilities

- `automatic-transitions`: carves out migration from "an advance operation returns only
  once the instance is at rest" — migration satisfies it by flagging for re-resolution.
- `timers`: carves out migration from "a timer not fired by the time its step is exited
  is discarded", and states the reconciliation rule.

### New Requirements on Existing Capabilities

These deltas add requirements without changing existing ones:

- `subprocess-execution`: a migrating parent repairs the `parent` link of **all** its
  children, not only active ones.
- `runtime-events`: adds the `migration.skipped` event kind.
- `cel-expressions`: adds the migration `transform` site.
- `persistence`: the `migration_plans` relation and an index supporting the migration
  scan.

## Impact

- `src/schema/definition.ts`: `migration.skipped` added to `InstanceEvent`;
  `migrationSpec` gains a `fieldMap` injectivity refinement and loses `fromVersion`;
  `migration` removed from the `processVersion` wrapper. `ProcessBody` untouched, so no
  published definition changes hash.
- `src/engine/migration.ts` (new): the plan store and the operation.
- `src/engine/store.ts`: `migration_plans` and the scan index.
- `src/cel/check.ts`, `src/cel/eval.ts`: the transform site and its evaluation.
- `src/engine/transition.ts` and `src/engine/subprocess.ts` are changed by the
  prerequisites, not by this change. `src/engine/outbox.ts` and
  `src/engine/definitions.ts` are unchanged.
- No new dependencies.
