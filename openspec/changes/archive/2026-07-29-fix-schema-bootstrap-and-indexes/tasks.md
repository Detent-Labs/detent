## 1. Bootstrap the schema where the server starts

- [x] 1.1 In `src/http/server.ts::startHttpServer`, `await initSchema(db)`
  before `Bun.serve` (`:380`) — not after, and not fire-and-forget, or
  requests can arrive before the schema exists
- [x] 1.2 Make `startHttpServer` async if it is not already, and update its
  callers and any test that starts a server
- [x] 1.3 In `src/auth/cli.ts`, `await initSchema()` before dispatching the
  command, so `add-user` works against a fresh database
- [x] 1.4 Leave `startEngine` alone — an embedding host owns its own
  composition root, and two callers would raise the question of which owns it

## 2. Fail fast on a missing connection string

- [x] 2.1 In `src/engine/store.ts:26`, replace
  `new SQL(process.env.DATABASE_URL ?? "")` with a construction that throws an
  error naming `DATABASE_URL` when it is unset
- [x] 2.2 Check the test suites: they set the variable, but confirm none
  imports the module expecting the empty-string tolerance (the `skipIf(!DB)`
  suites import it unconditionally, so this needs verifying before it is
  assumed) — **found a real gap, not a false alarm.**

  Every file that imports `store.js` guards its own tests with
  `skipIf(!DB)`. But a first, eager `export const sql = new
  SQL(requireDatabaseUrl())` throws during module evaluation, before any
  `skipIf` check runs. Bun's static-import linking then surfaces that as a
  cascading `ReferenceError: Cannot access '<binding>' before
  initialization` in unrelated modules. It is not a clean per-file skip.

  Confirmed with the full engine suite, `DATABASE_URL` unset: 11 fail / 5
  errors before the fix below, 0 fail / 558 skip after.

  Fixed by making `sql` a `Proxy` that defers real construction (and the
  throw) to first use; see `store.ts`'s updated comment. Both real entry
  points (`startHttpServer`, `src/auth/cli.ts`) call `initSchema` before
  anything else, per section 1. First use is still the first thing that
  happens for them, so "fails immediately" still holds in production. A
  module that imports without ever touching `sql`/`initSchema` — every
  `skipIf(!DB)` suite — skips the check entirely.

  One suite, `test/data-source-registry.test.ts`, briefly worked around the
  single-file version of this gap by reconstructing
  `createDefaultDataSourceRegistry` locally, before the `Proxy` fix made
  that unnecessary. It now imports `host.js` again, unchanged from before
  this task.
- [x] 2.3 Update the comment at `:25`, which documents the deferred-failure
  behavior as intentional

## 3. The two missing indexes

- [x] 3.1 Add
  `CREATE INDEX IF NOT EXISTS history_entries_instance_idx ON history_entries (instance_id, transition_seq)`
  immediately after the `history_entries` CREATE TABLE (`store.ts:34-39`),
  with a comment naming its two readers: `outbox.ts::appendOutcome` and
  `api.ts::getInstanceRecord`
- [x] 3.2 Add
  `CREATE INDEX IF NOT EXISTS instances_parent_idx ON instances ((body->'parent'->>'instanceId'))`
  beside the other `instances` expression indexes (`:147-161`), with a comment
  naming `transition.ts::sweepCancelledChildren` and `migration.ts::migrateOne`
- [x] 3.3 Use a plain B-tree expression index for the parent id, not GIN — the
  predicate is equality on one extracted text value, the same shape as
  `instances_claimed_by_idx`
- [x] 3.4 Leave `status` out of the parent index: low cardinality, and the
  parent id alone reduces the scan to a handful of rows

## 4. Verify the indexes are actually used

- [x] 4.1 `EXPLAIN` `appendOutcome`'s update against a populated
  `history_entries` and confirm an index scan
- [x] 4.2 `EXPLAIN` the child-instance lookup against a populated `instances`
  and confirm an index scan
- [x] 4.3 Record both plans in the PR description — an index that exists and
  is not used is a write cost with no read benefit, and the expression must
  match the query's expression exactly for it to be chosen. Recorded here in
  lieu of a PR description (no PR opened for this worktree commit):

  Seeded 20,000 `history_entries` rows over 5,000 `instances`, then:
  ```
  EXPLAIN (COSTS OFF) UPDATE history_entries SET entry = entry
    WHERE instance_id = 'inst_42' AND transition_seq = 1;

   Update on history_entries
     ->  Index Scan using history_entries_instance_idx on history_entries
           Index Cond: ((instance_id = 'inst_42'::text) AND (transition_seq = 1))
  ```

  Seeded 50,000 `instances` rows, 10 sharing each of 5,000 distinct parent
  ids. That gives realistic selectivity. (A single parent id matching every
  row correctly seq-scans instead, as it should.)
  ```
  EXPLAIN (COSTS OFF) SELECT * FROM instances
    WHERE body->'parent'->>'instanceId' = 'inst_parent_17'
      AND body->>'status' = 'running';

   Bitmap Heap Scan on instances
     Recheck Cond: (((body -> 'parent'::text) ->> 'instanceId'::text) = 'inst_parent_17'::text)
     Filter: ((body ->> 'status'::text) = 'running'::text)
     ->  Bitmap Index Scan on instances_parent_idx
           Index Cond: (((body -> 'parent'::text) ->> 'instanceId'::text) = 'inst_parent_17'::text)
  ```
- [x] 4.4 Do **not** turn either plan into a test assertion: `persistence`
  already establishes that the requirement is on the index existing, since a
  planner may legitimately choose a sequential scan on a small relation. Plan
  inspection is verification for this change, not a pinned property

## 5. Tests

- [x] 5.1 A test that starts the server against a database with the schema
  dropped and confirms a request succeeds — this is the ERR-9 regression and
  it must fail without the fix (`test/schema-bootstrap.test.ts`)
- [x] 5.2 A test that `initSchema` run twice in a row changes nothing
  (extended the existing idempotency test in `test/migration.test.ts` to also
  cover both new indexes)
- [x] 5.3 Confirm the existing suites' `beforeAll` `initSchema` calls still
  work unchanged — they are unaffected, but the count of DDL statements
  changes, so a suite that asserts on the schema shape would notice (checked:
  only `test/migration.test.ts`'s idempotency test asserts on schema shape,
  and only by naming specific tables/indexes/columns, not a count — unaffected)

## 6. Documentation

- [x] 6.1 `README.md` — the Develop block should say that `bun run serve`
  creates the schema, since the current text implies a database must be
  prepared some other way
- [x] 6.2 `docs/current-state.md` — the persistence entry: schema creation now
  happens at server start, and the two new indexes with their readers
- [x] 6.3 Note the `CREATE INDEX CONCURRENTLY` pre-step for a deployment with
  existing volume, per design.md's migration plan, wherever operational notes
  live (added to `README.md`, alongside 6.1 — no separate ops doc exists)

## 7. Verification

- [x] 7.1 Run `bun run typecheck` from the repo root and confirm it passes
- [x] 7.2 Run the FULL `bun test` suite with `DATABASE_URL` set and confirm it
  passes — check the skip count, not only the pass count.

  Results: 907 pass / 0 fail / 0 skip with `DATABASE_URL` set. Without it:
  349 pass / 558 skip / 0 fail. See the 2.2 note above for why the
  skip-not-fail outcome needed a real fix.
- [x] 7.3 Point `bun run serve` at a genuinely empty database and exercise one
  request end-to-end.

  Covered by `test/schema-bootstrap.test.ts`'s first test. It drops every
  table, then starts the real HTTP server via `startHttpServer`.
- [x] 7.4 Run `src/auth/cli.ts add-user` against a genuinely empty database
  (covered by `test/schema-bootstrap.test.ts`'s second test, which drops
  `auth_users` and spawns the real CLI binary)
- [x] 7.5 Start a process with `DATABASE_URL` unset and confirm the error
  names the variable.

  Covered by `test/schema-bootstrap.test.ts`'s third test, which spawns the
  CLI with `DATABASE_URL` deleted from its environment.
