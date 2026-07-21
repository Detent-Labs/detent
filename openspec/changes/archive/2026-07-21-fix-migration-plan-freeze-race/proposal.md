## Why

`migrateInstances` reads the registered plan (`resolveMigrationPlan`, `migration.ts:407`)
into a local `spec` variable, then only later stamps `applied_at` with a separate
`UPDATE` (`migration.ts:418-419`). Between those two statements a concurrent
`registerMigrationPlan` call still sees `applied_at IS NULL` and legitimately
overwrites the stored spec. The running invocation keeps migrating the instance
population under the spec it already read into memory, while the row that ends up
permanently frozen holds a different spec — one that was never actually applied to
any instance. This is exactly the hazard `openspec/specs/instance-migration/spec.md`
already rules out ("A registration racing an invocation does not slip through",
"One invocation uses one spec throughout"): the requirement is correct, the
implementation does not meet it. Fixing it now, before this code sees production
traffic, avoids a frozen historical record that permanently misdescribes what a
migration actually did — a plan key cannot be re-registered once applied, so there
is no way to correct it after the fact.

## What Changes

- Collapse the read of the plan and the freeze stamp in `migrateInstances` into one
  atomic statement: `UPDATE migration_plans SET applied_at = COALESCE(applied_at,
  now()) WHERE process_id = ... AND from_version = ... AND to_version = ...
  RETURNING spec, applied_at`.
- Use the `spec` returned by that statement — not a separately-read one — for the
  rest of the invocation, so the spec actually applied to every instance is
  guaranteed to be the same spec left frozen on the row.
- Preserve existing behavior otherwise: refuse when no plan row exists for the key
  (checked from the `UPDATE`'s result, replacing today's separate
  `resolveMigrationPlan` existence check), migrate the population exactly as before,
  and keep the "stamped even when everything is skipped" guarantee.
- Add a regression test that registers a plan, then — using the same explicit
  `SQL`/transaction seam `migrateInstances` already accepts (`db` parameter) — drives
  a concurrent `registerMigrationPlan` into the window between the read and the
  freeze, and asserts the frozen spec matches the one actually used to migrate the
  instance (not a subsequently-registered one).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `instance-migration`: tighten "A plan is frozen by an atomic guard once applied"
  so the invocation's read-and-freeze is explicitly required to be one atomic
  operation (mirroring the atomicity already required of registration), closing the
  wording gap that let a read-then-separate-write implementation pass review. The
  intent — one invocation, one spec, no window for a race — was already there; this
  makes the atomicity requirement unambiguous on both sides of the race instead of
  just one.

## Impact

- `src/engine/migration.ts`: `migrateInstances` (the plan read + freeze stamp) and,
  if `resolveMigrationPlan` is no longer called from this path, a check that nothing
  else regresses.
- `test/migration.test.ts` (or equivalent): a new race-condition regression test.
- No schema, API, or storage-shape changes; no changes to `registerMigrationPlan`'s
  own atomic upsert, which is already correct.
