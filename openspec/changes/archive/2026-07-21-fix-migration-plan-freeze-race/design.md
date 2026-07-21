## Context

`migrateInstances` (`src/engine/migration.ts:400-445`) is supposed to read a
migration plan exactly once and use that one spec for every instance it touches,
freezing the plan so it can never again be edited (`openspec/specs/instance-migration/spec.md`,
"A plan is frozen by an atomic guard once applied"). Today it does this in two
separate round-trips:

```ts
const plan = await resolveMigrationPlan(processId, fromVersion, toVersion, db);   // (1) read
...
await db`UPDATE migration_plans SET applied_at = COALESCE(applied_at, now()) ...`; // (2) freeze
```

`registerMigrationPlan`'s own upsert (`migration.ts:163-167`) is already atomic — a
single `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE applied_at IS NULL RETURNING`.
Its `WHERE applied_at IS NULL` guard is exactly what lets it slip between (1) and
(2) above: at that point the row is still unfrozen, so a well-formed registration
call legitimately updates `spec`. `migrateInstances` has already captured the old
spec in a local variable by then, so it proceeds against stale data while (2) freezes
the row with the new spec still on it — the frozen record and the instances it
supposedly governs disagree, permanently and uncorrectably (a frozen key can never
be re-registered).

This is a narrow, single-function race: no schema change, no new table, no new
concurrency primitive — the fix is to make step (1) and (2) the same statement.

## Goals / Non-Goals

**Goals:**
- Close the window between reading a plan's spec and freezing it, for good, with a
  single round-trip to Postgres.
- Preserve every existing observable behavior of `migrateInstances` other than the
  race: refusal when no plan is registered, "freeze even if everything is skipped",
  one spec for the whole invocation including across batches, and idempotent re-use
  of the frozen spec if a plan is already applied.
- Add a test that proves the race is closed, not just that the happy path still
  works.

**Non-Goals:**
- Touching `registerMigrationPlan`'s upsert, which is already correct and is the
  other half of this same guarantee.
- Changing `MigrationSpec`, the `migration_plans` table shape, or any other
  migration behavior (step mapping, timer reconciliation, data remap, skip
  reasons).
- Addressing any other finding from the review (`20260721-Code-Spec-Review.md`) —
  this change is scoped to #8 only.

## Decisions

**Fold the read into the freeze UPDATE, returning the row that is actually true
after the statement runs.**

```sql
UPDATE migration_plans
SET applied_at = COALESCE(applied_at, now())
WHERE process_id = $1 AND from_version = $2 AND to_version = $3
RETURNING spec, applied_at
```

This is a single atomic statement: Postgres takes the row lock, evaluates
`COALESCE`, writes it, and returns the post-write row all under one execution — there
is no gap in which another statement can observe or mutate the row in between. The
`WHERE applied_at IS NULL` guard from `registerMigrationPlan`'s upsert still governs
whether *that* statement can win a race against this one; whichever of the two
statements actually commits first is the one whose effect the other sees, and there
is no longer a version of "read, then someone else writes, then I write" for
`migrateInstances` — it's "write (idempotently), and read back what is now true."

`migrateInstances` then uses the `spec` and `applied_at` this statement returns for
the rest of the invocation, in place of the separately-read `resolveMigrationPlan`
call. Zero rows returned means no plan is registered for the key — the existing
`MigrationPlanError` refusal, now driven off this result instead of the prior
`resolveMigrationPlan` lookup.

Alternatives considered:
- **`SELECT ... FOR UPDATE` then `UPDATE` in the same transaction.** Two
  round-trips again, just wrapped in a transaction — the row lock from `SELECT ...
  FOR UPDATE` does close the race (a concurrent upsert would block on the lock
  until this transaction commits), but it's strictly more code and a longer-held
  lock for no behavioral benefit over a single `UPDATE ... RETURNING`, which gets
  the same atomicity for free. Rejected: no upside over the simpler statement.
- **Optimistic check-after-write** (write the freeze, then compare against a
  separate read to detect if it changed underneath). Adds a comparison step and a
  retry/error path for a case that can't actually arise once the write itself is
  atomic — solving a problem the single-statement approach doesn't have. Rejected
  as unnecessary complexity.
- **Advisory lock around the whole invocation.** Would also close the race but adds
  a new concurrency primitive and a lock-scope decision (per key? per process?) for
  a problem fully solved by the row-level atomicity Postgres already gives a single
  `UPDATE`. Rejected: bigger surface for no additional guarantee.

**Keep `resolveMigrationPlan` (the read-only lookup) as-is.** It's used elsewhere
(e.g. by callers wanting to inspect a plan without running a migration) and has no
race of its own to close — nothing downstream of it mutates the row based on a
stale read the way `migrateInstances` did.

## Risks / Trade-offs

- [The `UPDATE` now runs even when the key doesn't exist, touching zero rows] →
  No mitigation needed: an `UPDATE ... WHERE <key predicate>` against a
  nonexistent row is a normal zero-row no-op in Postgres, functionally identical to
  today's `SELECT` finding nothing.
- [A currently-passing caller might rely on `migrateInstances` calling
  `resolveMigrationPlan` for some side effect] → Checked: `resolveMigrationPlan`
  has no side effects, it's a pure `SELECT`. None to preserve.
- [Test needs to actually exercise the race, not just assert the fixed code path
  runs] → The regression test drives `registerMigrationPlan` and `migrateInstances`
  through the same `db`/transaction seam `migrateInstances` already accepts as a
  parameter, sequencing a plan re-registration to land inside the fixed statement's
  atomic window is not directly observable from outside — so the test instead
  proves the invariant the fix guarantees: after a concurrent registration attempt
  during migration, the spec frozen on the row is the same spec that was actually
  used to migrate every instance in that invocation (never a spec that was
  registered but never applied to anything).

## Migration Plan

Pure code change in `src/engine/migration.ts`, no data migration, no deployment
sequencing concerns — the `migration_plans` table shape is unchanged. Ship as a
normal commit behind the existing `bun test` suite plus the new regression test.

## Open Questions

None — the fix is fully determined by the existing spec requirement and the shape
of `registerMigrationPlan`'s existing atomic upsert.
