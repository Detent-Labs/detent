## 1. Bootstrap the schema where the server starts

- [ ] 1.1 In `src/http/server.ts::startHttpServer`, `await initSchema(db)`
  before `Bun.serve` (`:380`) — not after, and not fire-and-forget, or
  requests can arrive before the schema exists
- [ ] 1.2 Make `startHttpServer` async if it is not already, and update its
  callers and any test that starts a server
- [ ] 1.3 In `src/auth/cli.ts`, `await initSchema()` before dispatching the
  command, so `add-user` works against a fresh database
- [ ] 1.4 Leave `startEngine` alone — an embedding host owns its own
  composition root, and two callers would raise the question of which owns it

## 2. Fail fast on a missing connection string

- [ ] 2.1 In `src/engine/store.ts:26`, replace
  `new SQL(process.env.DATABASE_URL ?? "")` with a construction that throws an
  error naming `DATABASE_URL` when it is unset
- [ ] 2.2 Check the test suites: they set the variable, but confirm none
  imports the module expecting the empty-string tolerance (the `skipIf(!DB)`
  suites import it unconditionally, so this needs verifying before it is
  assumed)
- [ ] 2.3 Update the comment at `:25`, which documents the deferred-failure
  behavior as intentional

## 3. The two missing indexes

- [ ] 3.1 Add
  `CREATE INDEX IF NOT EXISTS history_entries_instance_idx ON history_entries (instance_id, transition_seq)`
  immediately after the `history_entries` CREATE TABLE (`store.ts:34-39`),
  with a comment naming its two readers: `outbox.ts::appendOutcome` and
  `api.ts::getInstanceRecord`
- [ ] 3.2 Add
  `CREATE INDEX IF NOT EXISTS instances_parent_idx ON instances ((body->'parent'->>'instanceId'))`
  beside the other `instances` expression indexes (`:147-161`), with a comment
  naming `transition.ts::sweepCancelledChildren` and `migration.ts::migrateOne`
- [ ] 3.3 Use a plain B-tree expression index for the parent id, not GIN — the
  predicate is equality on one extracted text value, the same shape as
  `instances_claimed_by_idx`
- [ ] 3.4 Leave `status` out of the parent index: low cardinality, and the
  parent id alone reduces the scan to a handful of rows

## 4. Verify the indexes are actually used

- [ ] 4.1 `EXPLAIN` `appendOutcome`'s update against a populated
  `history_entries` and confirm an index scan
- [ ] 4.2 `EXPLAIN` the child-instance lookup against a populated `instances`
  and confirm an index scan
- [ ] 4.3 Record both plans in the PR description — an index that exists and
  is not used is a write cost with no read benefit, and the expression must
  match the query's expression exactly for it to be chosen
- [ ] 4.4 Do **not** turn either plan into a test assertion: `persistence`
  already establishes that the requirement is on the index existing, since a
  planner may legitimately choose a sequential scan on a small relation. Plan
  inspection is verification for this change, not a pinned property

## 5. Tests

- [ ] 5.1 A test that starts the server against a database with the schema
  dropped and confirms a request succeeds — this is the ERR-9 regression and
  it must fail without the fix
- [ ] 5.2 A test that `initSchema` run twice in a row changes nothing
- [ ] 5.3 Confirm the existing suites' `beforeAll` `initSchema` calls still
  work unchanged — they are unaffected, but the count of DDL statements
  changes, so a suite that asserts on the schema shape would notice

## 6. Documentation

- [ ] 6.1 `README.md` — the Develop block should say that `bun run serve`
  creates the schema, since the current text implies a database must be
  prepared some other way
- [ ] 6.2 `docs/current-state.md` — the persistence entry: schema creation now
  happens at server start, and the two new indexes with their readers
- [ ] 6.3 Note the `CREATE INDEX CONCURRENTLY` pre-step for a deployment with
  existing volume, per design.md's migration plan, wherever operational notes
  live

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` from the repo root and confirm it passes
- [ ] 7.2 Run the FULL `bun test` suite with `DATABASE_URL` set and confirm it
  passes — check the skip count, not only the pass count
- [ ] 7.3 Point `bun run serve` at a genuinely empty database and exercise one
  request end-to-end
- [ ] 7.4 Run `src/auth/cli.ts add-user` against a genuinely empty database
- [ ] 7.5 Start a process with `DATABASE_URL` unset and confirm the error
  names the variable
