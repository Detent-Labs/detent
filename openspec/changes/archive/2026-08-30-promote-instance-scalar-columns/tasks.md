<!-- antislop: allow-file synonym-rotation -->
<!-- "ALTER TABLE" throughout this file is the SQL statement name, not a rotated synonym for "change"/"update". -->
## 1. Schema

- [x] 1.1 Add `process_id`, `version`, `status`, `current_step_id`,
  `started_by`, `started_at` as `ALTER TABLE instances ADD COLUMN IF NOT
  EXISTS ... GENERATED ALWAYS AS (...) STORED` statements in
  `src/engine/store.ts::initSchema`. Verify `bun run typecheck` passes.
- [x] 1.2 Add the index
  `CREATE INDEX IF NOT EXISTS instances_started_idx ON instances (started_at)`.
  Give it a comment naming `selectInRange` as its reader, matching the
  existing index-comment convention. Verify `initSchema` still runs clean
  against the devcontainer's Postgres 16.

## 2. Ponytail fix

- [x] 2.1 Rewrite `selectInRange` in `src/engine/reporting.ts` to filter
  `started_at >= range.from AND started_at <= range.to` instead of casting
  `body->>'startedAt'` to `timestamptz`. Remove the resolved ponytail
  comment. Verify `bun run typecheck` passes.

## 3. Tests

- [x] 3.1 Add `test/instance-column-promotion.test.ts` with a schema-init
  idempotency test. Run `initSchema` twice. Assert the six columns and
  `instances_started_idx` exist via `information_schema.columns` and
  `pg_indexes`, unchanged on the second run.
- [x] 3.2 Add one test per new column (`process_id`, `version`, `status`,
  `current_step_id`, `started_by`, `started_at`). Create a real instance via
  `createInstance`, then `SELECT <column> FROM instances WHERE instance_id =
  ...`. Assert it matches the value in `body`. Confirm each test catches a
  missing column: comment out the matching `ALTER TABLE` on a scratch copy,
  then watch the test fail. `CLAUDE.md`'s never-mutate-the-shared-tree rule
  covers where that copy lives.
- [x] 3.3 Add a test that updates an instance's `body`, via a manual
  transition changing `currentStepId` and `status`. Assert the generated
  columns read the new values, with no separate write.
- [x] 3.4 Add a test exercising `selectInRange`/`cycleTime` across a
  populated date boundary. Assert it drops instances outside `[from, to]`
  and keeps instances inside it, now that the predicate reads `started_at`
  as text.

## 4. Docs

- [x] 4.1 Update `docs/decisions.md`'s "Promoting standardized instance keys
  out of `body` into columns" entry. Mark the six-scalar half done. Keep the
  Change 2 scope (`assignment.claimedBy`/`candidates`, `parent.instanceId`,
  `currentStepEnteredAt`, `chainedFrom`, and the index rebuild) as the
  remaining "Not started" part.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`, then `bun run build`, and confirm both
  succeed with no errors.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set, never a
  single-file rerun. Pipe it through `sh scripts/gates/silent-green.sh` as
  `bun test 2>&1 | tee <log>; sh scripts/gates/silent-green.sh <log>`.
  Confirm every test above passes by name. Confirm the printed skip count
  is not silently elevated.
- [x] 5.3 Run the antislop check on every Markdown file this change
  touches: `docs/decisions.md` plus this change's own artifacts. Fix every
  finding.
- [x] 5.4 Run `sh scripts/gates/whitespace.sh < /dev/null` and `sh
  scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. Fix any
  finding from either.
