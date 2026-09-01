## Why

Change 1 (`promote-instance-scalar-columns`, 2026-08-30) promoted six
`Instance` scalars into generated columns. Three expression indexes on
`instances` still stand over keys those columns already carry. Every reader
still names the jsonb expression rather than the column.

A benchmark over 200.000 rows measured what the rebuild is worth
(`tmp/instance-column-promotion-messung.md`, 2026-09-01, medians of nine
`EXPLAIN (ANALYZE, BUFFERS)` runs). All six queries that use these indexes get
faster. The index size does not move, and the selection index's write overhead
falls.

## What Changes

- `instances_selection_idx` gives way to a plain btree over
  `(process_id, version, status)`. `instances_current_step_idx` gives way to a
  plain btree over `(current_step_id)`, and `instances_started_by_idx` to one
  over `(started_by)`. All three columns already exist.
- The three new indexes carry new names. Under a reused name the
  `CREATE INDEX IF NOT EXISTS` statement skips the index, whatever its
  definition. Every existing database would keep the old shape. So
  `initSchema` drops the three old names with `DROP INDEX IF EXISTS`.
- The readers that reach these indexes rewrite their predicates onto the
  columns. The planner substitutes neither form for the other. Without the
  rewrite the new indexes serve nobody. Those readers are `buildInstanceWhere`
  (`src/runtime/api.ts`), the migration population scan and `findOrphanKeys`
  (`src/engine/migration.ts`), `liveVersionCounts`
  (`src/engine/definitions.ts`), and `selectInRange` plus the bottlenecks
  work-in-progress query (`src/engine/reporting.ts`).
- **BREAKING** at the SQL level only: `buildInstanceWhere`'s `version` filter
  compares as `integer` against the `version` column. It compares as `text`
  against `body->>'version'` today. No caller signature changes;
  `InstanceListFilter.version` is already a `number`.
- A `status` predicate already narrowed to one row by `instance_id` stays on
  the jsonb expression, as does one another index already carries. The
  measurement names the queries that use these three indexes. Those are the
  ones that move.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `persistence`: the requirement "Every query predicate the engine relies on
  has a supporting index" names all three indexes. It also states that a
  `STORED` generated column cannot serve the current-step predicate. The
  rebuild makes that statement false and replaces the three index definitions.
- `instance-query`: the requirement "List instance summaries with filters"
  names `instances_selection_idx` as the index a `version` filter reaches. The
  index name and the comparison type both change. The rule that a `version`
  filter needs a `processId` beside it stays, on its first reason.

## Impact

- `src/engine/store.ts`: three `CREATE INDEX` statements replaced, three
  `DROP INDEX IF EXISTS` statements added, comments rewritten.
- `src/runtime/api.ts`: `buildInstanceWhere`'s `processId`, `version`,
  `status`, `currentStepId` and `startedBy` predicates; the `versionText`
  local disappears; `resolveVersionCoverage`'s `SELECT DISTINCT` projection;
  two doc comments naming the old index.
- `src/engine/migration.ts`, `src/engine/definitions.ts`,
  `src/engine/reporting.ts`: the five queries listed above.
- `src/engine/admin-queries.ts`: one doc comment naming the old index.
- `test/migration.test.ts`: the three schema-init index assertions.
- `test/runtime-api.test.ts`: the new `version`-comparison test.
- `docs/current-state.md`, `docs/decisions.md`: the passages naming the three
  index definitions.
- No HTTP route, no schema type, no UI. Nothing here touches `Instance` or the
  definition contract.
