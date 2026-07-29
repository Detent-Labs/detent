# Create the schema on startup, and index the two predicates that scan

## Why

Three defects in the persistence layer, all in `src/engine/store.ts`, all
following the same pattern: a rule the file applies consistently, with two or
three positions left out.

**`bun run serve` never creates the database schema.** `initSchema` owns all
DDL — `instances`, `history_entries`, `instance_events`, `outbox`,
`definitions`, `auth_users`, drafts, migration plans. Grepping every caller
across `src/`, `scripts/` and `packages/` returns exactly two non-test sites:
its own definition and `scripts/demo-expense-approval.ts:42`. Neither
`startHttpServer` nor `startEngine` calls it — `server.ts:377-382` goes
straight from `parseAllowedOrigins` to `Bun.serve` to `startEngine`. So
`"serve"`, a first-class documented script, fails with a
relation-does-not-exist error at *request* time against any database that has
not previously had `bun test` or the demo script run against it.
`src/auth/cli.ts` does not call it either, so `add-user` against a fresh
database fails the same way. Compounding it, the shared client is built at
module load from `process.env.DATABASE_URL ?? ""`, so a missing connection
string is also deferred to the first query. ROADMAP stages 14 (packaging) and
19 (seed data) are deliberately deferred and neither covers schema DDL.

**`history_entries` has no index on its only query predicate.** `initSchema`
creates it with four columns and nothing else; the structurally identical
sibling created sixteen lines below gets
`instance_events_instance_idx ON instance_events (instance_id, transition_seq)`.
The two hot predicates against `history_entries` are exactly that missing key:
`appendOutcome`'s `UPDATE ... WHERE instance_id = $1 AND transition_seq = $2`
(`outbox.ts:131-133`) and `getInstanceRecord`'s `WHERE instance_id = ...`
(`api.ts:737`) — whose `UNION ALL` counterpart over `instance_events` *is*
indexed. `appendOutcome` runs on every delivered and dead-lettered outbox row,
inside tx2 while it holds the outbox row lock, so the scan cost converts
directly into lock-hold time and caps outbox throughput. `history_entries` is
append-only with no pruning path anywhere, so the scan grows monotonically
with lifetime transition volume across all instances.

**Child-instance lookup has no supporting index.** `sweepCancelledChildren`
runs `SELECT ... FROM instances WHERE body->'parent'->>'instanceId' = $1 AND
body->>'status' = 'running'` (`transition.ts:526-528`), and `migrateOne`'s
live-child gate uses the same expression (`migration.ts:431-437`).
`initSchema` builds expression indexes for every *other* jsonb-nested
predicate it needs — `instances_selection_idx`, `instances_claimed_by_idx`,
and a GIN index on `body->'assignment'->'candidates'` — but none on
`body->'parent'->>'instanceId'`, and `instances_selection_idx` does not cover
it (its leading column is `processId`). `cancelInstance` calls the sweep on
every cancel and recursively once per nesting level, so cancelling a nested
chain is one full scan of `instances` per level, inside the caller's
transaction, holding instance row locks. `instances` is never pruned —
completed and cancelled rows stay — so the scan grows with lifetime volume,
not live volume. Three sibling jsonb predicates all got purpose-built indexes
with explanatory comments, which makes this a consistency gap rather than a
decision.

## What Changes

- `startHttpServer` awaits `initSchema(db)` before `Bun.serve`. Every
  statement is `CREATE ... IF NOT EXISTS`, so it is idempotent and safe on a
  database that already has the schema.
- `src/auth/cli.ts` does the same before its command runs, so `add-user`
  against a fresh database works.
- The shared client throws at boot with a message naming `DATABASE_URL` when
  it is unset, instead of deferring an opaque failure to the first query.
- Two indexes are added beside their siblings:
  `history_entries_instance_idx ON history_entries (instance_id,
  transition_seq)` and
  `instances_parent_idx ON instances ((body->'parent'->>'instanceId'))`,
  each with a comment naming its readers.

## Capabilities

### Modified Capabilities

- `persistence`: schema creation becomes part of starting the server rather
  than something a test run or a demo script happened to do first; and the two
  predicates that currently sequentially scan get indexes, matching the rule
  the same function already applies to every sibling predicate.

## Impact

- `src/engine/store.ts` — two `CREATE INDEX IF NOT EXISTS` lines and the
  client's boot-time check.
- `src/http/server.ts` — one `await` before `Bun.serve`; `startHttpServer`
  stays synchronous in signature or becomes async, which is a small ripple
  through its callers and tests.
- `src/auth/cli.ts` — one `await`.
- No contract, schema-shape or behavior change: no table gains or loses a
  column, and no query changes. The indexes are additive and take effect on
  the next `initSchema` run, which is now every server start.
- On a large existing database the two `CREATE INDEX` statements take time on
  first startup. Sized and mitigated in design.md.
- Tests already call `initSchema` explicitly in `beforeAll`; that stays true
  and unaffected.
