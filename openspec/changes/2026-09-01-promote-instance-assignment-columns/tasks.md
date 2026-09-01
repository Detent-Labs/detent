<!-- antislop: allow-file synonym-rotation -->
<!-- "ALTER TABLE", "DROP INDEX" and "CREATE INDEX" throughout this file are SQL statement names, not rotated synonyms for "change"/"update". -->
## 1. Schema

- [ ] 1.1 Add `claimed_by`, `candidates`, `parent_instance_id`,
  `current_step_entered_at` and `chained_from` to
  `src/engine/store.ts::initSchema`, each as `ALTER TABLE instances ADD
  COLUMN IF NOT EXISTS ... GENERATED ALWAYS AS (...) STORED`. Place them
  beside Change 1's six. Carry a comment naming why `candidates` is jsonb
  and why `current_step_entered_at` is text.
- [ ] 1.2 Drop `instances_claimed_by_idx`, `instances_candidates_idx` and
  `instances_parent_idx` with `DROP INDEX IF EXISTS`. Create
  `instances_claimed_idx` over `claimed_by`, `instances_candidate_idx` as
  GIN over `candidates`, and `instances_parent_instance_idx` over
  `parent_instance_id`. Give each a comment naming its readers, matching
  the existing index-comment convention.
- [ ] 1.3 Run `initSchema` twice against the devcontainer's Postgres 16 and
  confirm the second run is clean.

## 2. Predicate rewrites

- [ ] 2.1 Rewrite `buildInstanceWhere` (`src/runtime/api.ts`): the
  `claimedBy` filter and the three `assignedTo` branches read `claimed_by`
  and `candidates` instead of `body->'assignment'->>'claimedBy'` and
  `body->'assignment'->'candidates'`.
- [ ] 2.2 Rewrite `sweepCancelledChildren` (`src/engine/transition.ts`) to
  filter `parent_instance_id = $1`.
- [ ] 2.3 Rewrite the live-child gate in `migrateOne`
  (`src/engine/migration.ts`) to filter `c.parent_instance_id = $1`. Leave
  its `c.body->'parent'->>'stepId'` predicate alone; `stepId` gets no
  column in this change.
- [ ] 2.4 Rewrite `sweepRetention` (`src/engine/retention.ts`) to compare
  `COALESCE(current_step_entered_at, started_at)` against the `to_char`
  cutoff from `design.md`. Drop both `::timestamptz` casts.
- [ ] 2.5 Verify `bun run typecheck` passes after 2.1 through 2.4.

## 3. Tests

- [ ] 3.1 Extend `test/instance-column-promotion.test.ts` with a
  schema-init test for the five new columns and the three new indexes. Run
  `initSchema` twice. Assert via `information_schema.columns` and
  `pg_indexes` that the five columns and the three indexes exist. Assert
  the second run leaves each one as the first run left it.
- [ ] 3.2 Assert in the same file that `instances_claimed_by_idx`,
  `instances_candidates_idx` and `instances_parent_idx` are absent from
  `pg_indexes` after `initSchema`.
- [ ] 3.3 Add one test per new column. Create a real instance, then
  `SELECT <column> FROM instances WHERE instance_id = ...` and assert it
  matches the value in `body`. Cover the absent-key case for
  `parent_instance_id`, `chained_from` and `claimed_by`, each of which
  reads SQL NULL.
- [ ] 3.4 Add a test that claims a step, then releases it, and asserts
  `claimed_by` follows `body->'assignment'->>'claimedBy'` both ways with no
  separate write.
- [ ] 3.5 Confirm `listInstances` with `assignedTo` still returns what the
  jsonb-path predicate returned. Add whatever `test/runtime-api.test.ts`
  misses across these four cases:
  - an instance the actor claims
  - an unclaimed instance naming the actor among `candidates`
  - an unclaimed instance naming a role of the actor among `candidates`
  - an instance matching neither
- [ ] 3.6 Add a retention boundary test. Seed one instance whose
  `currentStepEnteredAt` is one day past the window and one that is one day
  inside it. Assert the sweep redacts the first and leaves the second.
  Cover the `COALESCE` fallback with a third instance carrying no
  `currentStepEnteredAt`.
- [ ] 3.7 Add one case to the retention test for a `currentStepEnteredAt`
  written without milliseconds, the form `test/retention.test.ts:181`
  already uses for `startedAt`. Assert it still compares correctly against
  the `to_char` cutoff. `design.md`'s Risks section explains why the schema
  does not pin the form.
- [ ] 3.8 Confirm each new test catches a missing column or a missing
  rewrite. Comment out the matching statement on a scratch copy of the
  tree, watch the test fail, and restore. `CLAUDE.md`'s
  never-mutate-the-shared-tree rule covers where that copy lives.

## 4. Docs

- [ ] 4.1 Update `docs/decisions.md`'s "Promoting standardized instance
  keys out of `body` into columns" entry. Record Change 2 as landed, with
  the measured before/after numbers from `design.md` and the heap cost.
  Keep the remaining expression-index rebuild as the open Change 3.
- [ ] 4.2 Update the index inventory in `docs/decisions.md` around lines
  68-70. It names `instances_claimed_by_idx`, `instances_candidates_idx`
  and `instances_parent_idx`, all three of which this change retires.
- [ ] 4.3 Update `docs/current-state.md` around line 2387. It names
  `instances_parent_idx ((body->'parent'->>'instanceId'))`, which becomes
  `instances_parent_instance_idx (parent_instance_id)`.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, then `bun run build`, and confirm both
  succeed with no errors.
- [ ] 5.2 Run the full `bun test` suite with `DATABASE_URL` set, never a
  single-file rerun. Pipe it through `sh scripts/gates/silent-green.sh` as
  `bun test 2>&1 | tee <log>; sh scripts/gates/silent-green.sh <log>`.
  Confirm every test above passes by name, and that the skip count is not
  raised.
- [ ] 5.3 Re-run the measurement against the implemented `initSchema`
  rather than the hand-built bench table, and confirm the plans match what
  `design.md` records. The bench scripts live in the untracked `tmp/`, so
  `design.md`'s tables stay the record; rebuild the script if `tmp/` is
  empty.
- [ ] 5.4 Run `sh scripts/gates/range.sh | sh scripts/gates/prose.sh` with
  the range on stdin, and `sh scripts/gates/whitespace.sh < /dev/null`. Fix
  every finding from either.
