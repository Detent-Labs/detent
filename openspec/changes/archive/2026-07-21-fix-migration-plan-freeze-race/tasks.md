## 1. Atomic read-and-freeze in `migrateInstances`

- [x] 1.1 In `src/engine/migration.ts`, replace the separate `resolveMigrationPlan`
      read (`migration.ts:407`) and the later `UPDATE migration_plans SET
      applied_at = COALESCE(applied_at, now()) WHERE ...` (`migration.ts:418-419`)
      with one statement: `UPDATE migration_plans SET applied_at =
      COALESCE(applied_at, now()) WHERE process_id = ... AND from_version = ... AND
      to_version = ... RETURNING spec`, executed once at the top of
      `migrateInstances`, before the batch loop. (`applied_at` is dropped from
      `RETURNING` since nothing in `migrateInstances` reads it — matches the old
      `resolveMigrationPlan`-based flow, which also never consumed `plan.appliedAt`.)
- [x] 1.2 Parse the returned `spec` the same way `resolveMigrationPlan` does
      (`migration.ts:188`): `migrationSpec.parse(typeof raw.spec === "string" ?
      JSON.parse(raw.spec) : raw.spec)` — jsonb can come back as a string —
      before using it for every `migrateOne` call in the invocation, in place of a
      separately-read value.
- [x] 1.3 When the `UPDATE` returns zero rows, throw the existing
      `MigrationPlanError` ("no plan registered for ...") in place of today's
      `if (!plan) throw ...` check.
- [x] 1.4 Keep the existing `fromBody`/`toBody` resolution and their "not
      published" refusals unchanged; only the plan read/freeze step moves.
- [x] 1.5 Confirm `resolveMigrationPlan` itself is untouched (still used by other
      callers as a pure read) and is no longer called from inside
      `migrateInstances`.

## 2. Regression test

- [x] 2.1 In `test/migration.test.ts`, add a `test.skipIf(!DB)` case using the same
      row-lock technique the existing "6.3 a concurrent writeback is preserved..."
      test uses (`test/migration.test.ts:572-593`): register a plan with a
      distinguishable effect (e.g. a `transforms` entry writing a marker field), then
      inside `sql.begin(async (tx) => { ... })` take `SELECT ... FOR UPDATE` on the
      `migration_plans` row for the key, start `migrateInstances` (it blocks on its
      own freeze `UPDATE` against that lock), wait briefly for it to reach the lock,
      then call `registerMigrationPlan` for the same key with a *different* spec
      (also blocks, or is refused — either is a valid outcome) before releasing the
      transaction. After both settle, assert: the instance was migrated using the
      spec that ends up frozen on the row (checked via `resolveMigrationPlan` after
      both calls settle) — e.g. by asserting the marker field matches only the
      frozen spec's `transforms` output — never the other spec's effect.
      Added as "a registration racing an invocation cannot leave the frozen spec
      disagreeing with what was applied", right after "freezing is per key".
- [x] 2.2 Keep the existing tests in `test/migration.test.ts` (freeze-per-key, "an
      unused plan is replaced; an applied plan is frozen", "an invocation that
      migrates nothing still freezes the plan") green — they exercise the
      non-concurrent path of the same behavior and must keep passing unmodified.

## 3. Verify

- [x] 3.1 `bun run typecheck` (`tsc --noEmit`) is clean.
- [x] 3.2 `bun test` with `DATABASE_URL` set passes in full (no new skips, no
      failures), including the new regression test. 363 pass / 0 fail, 18 files
      (up from the review baseline's 336 due to this and other recent changes).
