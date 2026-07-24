## Why

`instance-migration`'s in-flight-actions gate skips an instance the moment it
holds *any* undelivered outbox row, even a merely `pending` one with no worker
touching it — the CLAUDE.md roadmap flags this as a known gap, closed for now
by skipping rather than reconciling. This is proactive roadmap work (no
`pending-actions` pileup has been reported), closing the gap by narrowing the
skip to genuinely in-flight deliveries and reconciling the rest so an async
action result lands on the target version's field id instead of a vacated
source-version one.

## What Changes

- Narrow `migrateOne`'s in-flight check: only a `claimed` outbox row with an
  active lease (a worker plausibly mid-handler right now) still skips the
  instance with reason `pending-actions`. A `pending` row, or a `claimed` row
  whose lease has expired, no longer blocks migration.
- Remap eligible rows' `Action.output` target field ids through the plan's
  `fieldMap` snapshot image, in the same transaction as the migration, so a
  later delivery writes under the target version's field id. An id the
  `fieldMap` doesn't rename is retained by identity — including onto a field
  the target catalog no longer declares (orphan write-through), matching the
  data-payload remap's existing policy.
- Add `outbox.field_version`, stamped at enqueue time to the instance's
  version and bumped by `migrateOne` on remap, so every outbox row for an
  instance stays in lock-step with that instance's version — a "should never
  happen" invariant, not a runtime branch.
- Add a delivery-side version-fold predicate (`ClaimedRow.field_version` must
  still match the instance's current version) closing the residual race where
  a lease-expired-but-not-actually-dead worker completes delivery after
  `migrateOne` already remapped the row: the writeback affects no row and
  folds into the outbox's existing suppression accounting instead of writing
  under a stale field id.
- Lock this instance's outbox rows before its instance row in `migrateOne`
  (matching `drainOutbox`'s existing lock order) and add an index on
  `outbox.instance_id` to make both the eligibility scan and the new locking
  query indexed instead of a sequential scan.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `instance-migration`: the in-flight-actions requirement narrows from "any
  undelivered row blocks" to "only a live-claimed row blocks"; eligible rows
  are remapped and lock-ordered as part of the migration commit.
- `transactional-outbox`: outbox rows carry a `field_version` stamped at
  enqueue and checked at delivery, so a writeback that outlives a migration of
  its instance is suppressed rather than applied under a stale field id.

## Impact

- `src/engine/migration.ts`: `migrateOne`'s in-flight check, lock ordering,
  remap computation, lamination guard.
- `src/engine/outbox.ts`: `ClaimedRow` gains `field_version`; the delivery
  writeback's `UPDATE instances` predicate gains the version-fold check.
- `src/engine/store.ts`, `src/engine/transition.ts` (×2): the three
  `INSERT INTO outbox` sites stamp `field_version` at enqueue.
- Schema: `outbox.field_version` column (with an exact backfill — see
  design.md) and a new `outbox_instance_idx` index.
- No `Zod` schema change and no new `InstanceEvent` kind — this is
  engine-internal reconciliation, not a change to the JSON contract.
