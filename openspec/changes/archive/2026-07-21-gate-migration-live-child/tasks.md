## 1. Schema contract

- [x] 1.1 Add `child-in-flight` to the `migrationSkipReason` enum in `src/schema/definition.ts`.
- [x] 1.2 Update the enum's doc-comment to distinguish three causes: `step-unmappable` (rule property,
  recurs) vs. `pending-actions` and `child-in-flight` (transient, clear on their own).

## 2. Engine gate

- [x] 2.1 In `migrateOne` (`src/engine/migration.ts`), delete the unconditional child-link repoint
  block (the `jsonb_set(body, '{parent,stepId}', ...)` UPDATE gated on `stepChanged`).
- [x] 2.2 Before committing, when `stepChanged` and the source step is subprocess-typed, query for a
  live linked child: `parent.instanceId = id AND parent.stepId = srcStepId` AND
  (`child.status = 'running'` OR the child has an undelivered outbox row). Run it inside the existing
  row-locked transaction.
- [x] 2.3 If a live child exists, `appendSkip(tx, inst, fromVersion, toVersion, "child-in-flight")` and
  return `"skipped"` — no commit, no repoint. Otherwise proceed with the normal commit and no repoint.

## 3. Tests

- [x] 3.1 Rewrite `test/migration.test.ts:718` ("active child's parent link is repaired through a
  relocating stepMap"): a running child now makes the relocation skip with `child-in-flight`; assert
  the skip event and that the parent keeps its pin/step and the child link is unchanged.
- [x] 3.2 Replace `test/migration.test.ts:742` ("terminal child's parent link is repaired too"): drop
  the raw-SQL synthetic-terminal setup; cover the genuine settled-child pass-through instead — a
  child terminal with all outbox rows delivered does not block and is not repointed.
- [x] 3.3 Restructure `test/migration.test.ts:943` ("relocation onto a subprocess step enqueues a fresh
  spawn"): drive the source child to fully settled (e.g. `outcome-unmatched`, parent still parked)
  before relocating, so the fresh-spawn assertion holds without a live child blocking it.
- [x] 3.4 Rewrite `test/migration.test.ts:979` ("repaired terminal child's return drives the parked
  parent"): an undelivered return in flight now makes the migration skip with `child-in-flight`; then
  verify the unmigrated parent still completes correctly on the source version once the return drains.
- [x] 3.5 Add a retry-once-settled test: an instance skipped `child-in-flight` migrates on a later
  invocation after its child settles.

## 4. Verify

- [x] 4.1 `bun run typecheck` (`tsc --noEmit`) passes.
- [x] 4.2 `bun test` with `DATABASE_URL` set passes (confirm the migration and subprocess suites run,
  not skip); every new invariant has a test that rejects the violating case.
