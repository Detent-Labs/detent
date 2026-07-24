## 1. Schema

- [x] 1.1 In `src/engine/store.ts`, add the idempotent `ALTER TABLE outbox ADD COLUMN IF NOT EXISTS field_version integer;` and `CREATE INDEX IF NOT EXISTS outbox_instance_idx ON outbox (instance_id);` statements, matching the file's existing schema-setup style.
- [x] 1.2 Add the exact backfill statement (`UPDATE outbox SET field_version = (SELECT (body->>'version')::int FROM instances WHERE instances.instance_id = outbox.instance_id) WHERE field_version IS NULL;`) alongside the schema setup.

## 2. Stamp field_version at enqueue

- [x] 2.1 In `src/engine/store.ts`, set `field_version` on the create-time initial-step spawn's `INSERT INTO outbox`.
- [x] 2.2 In `src/engine/transition.ts`, set `field_version` on `applyStepEntry`'s general step-entry `INSERT INTO outbox`.
- [x] 2.3 In `src/engine/transition.ts`, set `field_version` on the timer-fire `INSERT INTO outbox`.

## 3. migrateOne: eligibility partition and lock ordering

- [x] 3.1 In `src/engine/migration.ts`, replace the "any undelivered row blocks" check with a query that locks the instance's undelivered outbox rows first (`SELECT ... FOR UPDATE ORDER BY idempotency_key`), before locking the instance row — matching `drainOutbox`'s lock order.
- [x] 3.2 Partition the locked rows into live-claimed (`status = 'claimed' AND claimed_at >= now() - CLAIM_LEASE_MS`) and safe (`pending`, or `claimed` with an expired lease).
- [x] 3.3 If any row is live-claimed, skip the instance with the existing `pending-actions` reason (same `migration.skipped` event, narrower trigger).
- [x] 3.4 Otherwise, proceed to lock and read the instance row as today.

## 4. migrateOne: remap and lamination guard

- [x] 4.1 Compute the snapshot-based `fieldMap` image once (reusing or mirroring `remapData`'s approach), and use it to rewrite each safe row's `Action.output` target field ids: renamed ids get their image, all others are retained by identity (including onto an orphaned/removed field — orphan write-through).
- [x] 4.2 Before remapping each safe row, assert its stored `field_version` equals the instance's pre-migration version; on mismatch, throw (landing the instance in the `failed` outcome, matching the existing `definitionHash` mismatch precedent) rather than skipping or silently remapping.
- [x] 4.3 Update each remapped row's `field_version` to `toVersion` and persist the rewritten `Action.output` mapping, in the same transaction as the instance's migration commit.

## 5. Delivery-side version fold

- [x] 5.1 In `src/engine/outbox.ts`, add `field_version` to `ClaimedRow` and populate it from the claim query (`tx1`).
- [x] 5.2 Add the predicate `AND (body->>'version')::int = ${row.field_version}` to `tx2`'s instance-writeback `UPDATE instances ... WHERE instance_id = ... AND status = 'running'`.
- [x] 5.3 Confirm the existing `suppressed = keys.length > 0 && affected === 0` accounting on `ActionOutcome` naturally covers the new predicate-fail case (no new status or branch needed).

## 6. Tests

- [x] 6.1 Add a test: an instance with only `pending` outbox rows migrates immediately (no `pending-actions` skip).
- [x] 6.2 Add a test: an instance with a `claimed` row whose lease has expired migrates immediately.
- [x] 6.3 Add a test: an instance with a `claimed` row under an active lease is still skipped with reason `pending-actions`.
- [x] 6.4 Add a test: a safe row's `Action.output` target id is rewritten through `fieldMap` (including an A↔B swap resolving correctly, not collapsing through an intermediate state) and delivery afterward writes under the new id.
- [x] 6.5 Add a test: a safe row whose target id has no `fieldMap` entry is retained by identity, including when the target catalog no longer declares that field (orphan write-through), and delivers with a `succeeded` `ActionOutcome`.
- [x] 6.6 Add a test: a `field_version` mismatch on a safe row causes the instance to fail the migration (no `HistoryEntry`, no `migration.skipped` event) rather than being remapped or skipped.
- [x] 6.7 Add a test for the lock-ordering/deadlock-avoidance guarantee: concurrent `migrateOne` and `drainOutbox` delivery against the same instance's row do not deadlock.
- [x] 6.8 Add a test for the delivery-side version fold: a claim taken before a migration, delivered after, is suppressed (`suppressed` accounting, no write under the stale field id) rather than applied.
- [x] 6.9 Add a test confirming a row enqueued via each of the three insert sites (creation spawn, transition step-entry, timer fire) carries `field_version` equal to the instance's version at that moment.
- [x] 6.10 Add a test for the backfill statement against rows lacking `field_version`, confirming it resolves to the instance's current version.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm it passes with no errors.
- [x] 7.2 Run the full `bun test` suite with `DATABASE_URL` set (never a single-file rerun) and confirm all tests pass with no unexpectedly skipped DB-backed suites.
