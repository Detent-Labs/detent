## Why

`promote-instance-scalar-columns` (2026-08-30) promoted six `Instance`
scalars into generated columns. It deferred five keys:
`assignment.claimedBy`, `assignment.candidates`, `parent.instanceId`,
`currentStepEnteredAt`, `chainedFrom`. `docs/decisions.md` names them
under "Promoting standardized instance keys out of `body` into columns",
and `tmp/offene-items.md` item 25 carries the split. This change is the
deferred half.

Three of the five carry an expression index today
(`instances_claimed_by_idx`, `instances_candidates_idx`,
`instances_parent_idx`). Two carry none. Every predicate over them names a
`body->'assignment'->>'claimedBy'`-shaped expression, so the index has to
repeat that expression to match.

## What Changes

- Add five `GENERATED ALWAYS AS (...) STORED` columns to `instances`:
  `claimed_by`, `parent_instance_id`, `current_step_entered_at` and
  `chained_from` as `text`, plus `candidates` as `jsonb`. The key stays in
  `body`, and `parseInstance` keeps reading it.
- Drop `instances_claimed_by_idx`, `instances_candidates_idx` and
  `instances_parent_idx`. Replace them with `instances_claimed_idx`
  (btree over `claimed_by`), `instances_candidate_idx` (GIN over
  `candidates`) and `instances_parent_instance_idx` (btree over
  `parent_instance_id`). The three new indexes carry new names. A database
  already holding the old ones converges in one `initSchema` run.
- Rewrite four predicates onto the new columns. Two sit in
  `buildInstanceWhere` (`src/runtime/api.ts`): the inbox predicate and the
  `claimedBy` filter. The other two are the child sweep in
  `src/engine/transition.ts` and the live-child gate in
  `src/engine/migration.ts`. The retention sweep in
  `src/engine/retention.ts` moves too. Without the rewrite the new indexes serve
  nothing. The planner never swaps a column for the expression behind it,
  which is the lesson Change 1 recorded.
- The retention sweep drops its two `::timestamptz` casts. It compares
  `COALESCE(current_step_entered_at, started_at)` against an ISO-8601
  cutoff string that `to_char` builds in the same statement.
- `chained_from` gets a column and no index. It has no reader today. The
  column exists so the report dimension `docs/decisions.md` names ("which
  instances did this process start") costs one `CREATE INDEX` later.

This change buys no measured speed. `design.md` carries the paired
before/after numbers. At 200k rows the plans and the timings match to
within noise. The five columns widen the heap by 11.6%. What the change
buys is one predicate vocabulary, and three fewer expression indexes.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `persistence`: `instances` gains five generated columns. Three expression
  indexes give way to three plain indexes over those columns.

`instance-query` and `data-retention` keep their requirements unchanged.
Both rewrites swap an expression for the column generated from it, so every
row that matched before matches after. The SQL shape those two reads use is
`persistence`'s subject, not theirs.

## Impact

<!-- antislop: allow synonym-rotation -->
<!-- "ALTER TABLE" below is the SQL statement name, not a rotated synonym for "change". -->
- `src/engine/store.ts` (`initSchema`): five `ALTER TABLE instances ADD
  COLUMN IF NOT EXISTS ... GENERATED ALWAYS AS (...) STORED` statements,
  three `DROP INDEX IF EXISTS`, three `CREATE INDEX IF NOT EXISTS`.
- `src/runtime/api.ts` (`buildInstanceWhere`): two predicate rewrites.
- `src/engine/transition.ts` (`sweepCancelledChildren`),
  `src/engine/migration.ts` (`migrateOne`'s live-child gate): one predicate
  rewrite each.
- `src/engine/retention.ts` (`sweepRetention`): one predicate rewrite,
  dropping two casts.
- `src/schema/definition.ts`: unchanged. All five keys already exist on
  `Instance`, so this is a storage-only projection.
- `test/instance-column-promotion.test.ts` and `test/retention.test.ts`:
  new cases for the five columns, the three index swaps and the retention
  boundary.
- `docs/decisions.md`: two entries. The index inventory near line 68 names
  the three retired indexes. The "Promoting standardized instance keys"
  entry records Change 2 as landed.
- `docs/current-state.md`: the passage naming `instances_parent_idx` and
  its expression.
- Out of scope: `instances_selection_idx`, `instances_current_step_idx` and
  `instances_started_by_idx`. Each is an expression index whose column
  already exists after Change 1. Retiring one therefore needs no new column.
  That is the optional Change 3.
