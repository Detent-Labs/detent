## 1. Schema

- [x] 1.1 In `src/engine/store.ts::initSchema`, drop `instances_selection_idx`,
      `instances_current_step_idx` and `instances_started_by_idx` with
      `DROP INDEX IF EXISTS`, placed before the statements that build the
      replacements. Verify by running `initSchema` twice against a database
      holding the old three and confirming `pg_indexes` lists none of them.
- [x] 1.2 Replace the three `CREATE INDEX` statements with plain btrees:
      `instances_selection_col_idx` over `(process_id, version, status)`,
      `instances_current_step_col_idx` over `(current_step_id)`,
      `instances_started_by_col_idx` over `(started_by)`. Verify `pg_indexes`
      lists the three new names after `initSchema`.
- [x] 1.3 Rewrite the comments above all three, naming their readers and the
      reason the names changed, per the `Each index SHALL carry a comment
      naming its readers` rule in the persistence spec. Verify by reading the
      block: each index's readers are named and the drop is explained.

## 2. Readers that reach the rebuilt indexes

- [x] 2.1 Rewrite `buildInstanceWhere` (`src/runtime/api.ts`) so `processId`,
      `version`, `status`, `currentStepId` and `startedBy` compare against
      `process_id`, `version`, `status`, `current_step_id` and `started_by`.
      Drop the `versionText` local and bind the number. Verify the existing
      `listInstances` filter tests still pass.
- [x] 2.2 Rewrite `resolveVersionCoverage`'s projection
      (`src/runtime/api.ts`) to `SELECT DISTINCT version`. Verify the report
      column-choice tests still pass.
- [x] 2.3 Rename `assertVersionHasProcessId` to `assertVersionFilter` and add
      a `Number.isInteger` check, throwing `RequestShapeError`. No sign check:
      a draft snapshot's version is negative. Update both call sites. Verify
      with a new test in `test/runtime-api.test.ts` passing a fractional
      `version` and expecting the rejection, not a datastore error.
- [x] 2.4 Update the two doc comments in `src/runtime/api.ts` that name
      `instances_selection_idx` and the text comparison, plus the one in
      `src/engine/admin-queries.ts`. Verify by grepping `src/` for
      `instances_selection_idx`: the only hits left are the three
      `DROP INDEX IF EXISTS` statements in `store.ts`.
- [x] 2.5 Rewrite the migration population scan and `findOrphanKeys`
      (`src/engine/migration.ts`) onto `process_id`, `version` and `status`,
      dropping the `::int` cast. Verify the migration and orphan-key suites
      still pass.
- [x] 2.6 Rewrite `liveVersionCounts` (`src/engine/definitions.ts`) so its
      projection, filter and `GROUP BY` all name columns. Verify the
      cross-process validation tests still pass.
- [x] 2.7 Rewrite `selectInRange`'s process predicate and the bottlenecks
      work-in-progress query (`src/engine/reporting.ts`) onto `process_id`,
      `status` and `current_step_id`. Verify the reporting suite still passes.

## 3. Tests

- [x] 3.1 Update the three schema-init index assertions in
      `test/migration.test.ts` to the new names. Verify the file's index tests
      pass in a full-suite run.
- [x] 3.2 Add a test that `initSchema` over a database carrying the three old
      index names leaves none of them behind. Create the three by hand first,
      so the test fails against an `initSchema` without the drops.
- [x] 3.3 Add a test in `test/runtime-api.test.ts` pinning the integer
      `version` comparison: an instance on version 2 comes back for
      `version: 2`, and a fractional `version` draws a `RequestShapeError`
      rather than a datastore error.

## 4. Documentation

- [x] 4.1 Update `docs/current-state.md` where it names
      `instances_current_step_idx` and `instances_started_by_idx` as
      expression indexes. Verify by grepping the file for the old names.
- [x] 4.2 Update `docs/decisions.md` where it lists the six expression
      indexes and the three that Change 1 left standing. Record that this
      change rebuilt them. Verify by grepping the file for the old names.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer. Verify it prints no
      error.
- [x] 5.2 Run `bun run build` in the devcontainer. Verify it completes.
- [x] 5.3 Run the full `bun test` in the devcontainer with `DATABASE_URL`
      set, piped through `sh scripts/gates/silent-green.sh <log>`. Verify the
      pass count and, separately, that the skip count sits at or under the
      floor. A single-file rerun proves nothing here.
- [x] 5.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
      and `sh scripts/gates/whitespace.sh < /dev/null`. Verify both print a
      pass.
- [x] 5.5 Seed a scratch database with enough rows to move the planner off a
      sequential scan, then run `EXPLAIN ANALYZE` for one query per rebuilt
      index. Verify each plan names the new index. Hold heap width, `VACUUM`
      state and hit count constant across the readings, per the plan-flip risk
      in design.md.
